/**
 * 1) -----------------------------------------------------------------------------------------------------------
 *      Use playwright navigate to the following urls.
 *      Check response status code (200, 404, 403), proceed only in case of code 200, throw an error in other cases.
 *      Use playwright methods select the country associated with the url.
 *
 *      Using cheerio extract from html:
 *          - fullPrice (it has to be a number)
 *          - discountedPrice (it has to be a number, if it does not exist same as fullPrice)
 *          - currency (written in 3 letters [GBP, USD, EUR...])
 *          - title (product title)
 *
 *      Result example
 *      {
 *          url: ${urlCrawled},
 *          fullPrice: 2000.12,
 *          discountedPrice: 1452.02,
 *          currency: 'GBP',
 *          title: 'Aqualung Computer subacqueo i330R'
 *      }
 * --------------------------------------------------------------------------------------------------------------
 */

const urls = [
    {
        url: 'https://www.selfridges.com/US/en/product/fear-of-god-essentials-camouflage-panels-relaxed-fit-woven-blend-overshirt_R04364969/#colour=WOODLAND%20CAMO',
        country: 'GB'
    },
    {
        url: 'https://www.selfridges.com/ES/en/product/gucci-interlocking-g-print-crewneck-cotton-jersey-t-shirt_R04247338/',
        country: 'US'
    },
    {
        url: 'https://www.selfridges.com/US/en/product/fear-of-god-essentials-essentials-cotton-jersey-t-shirt_R04318378/#colour=BLACK',
        country: 'IT'
    }
];


const { chromium } = require('playwright');
const cheerio = require('cheerio');

const COUNTRY_CURRENCY = {
    GB: 'GBP',
    UK: 'GBP',
    US: 'USD',
    ES: 'EUR',
    IT: 'EUR',
    FR: 'EUR',
    DE: 'EUR',
};

function parseNumber(n) {
    if (typeof n === 'number') return n;
    if (!n || typeof n !== 'string') return NaN;
    const cleaned = n.replace(/[^0-9.,-]/g, '');
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    let normalized = cleaned;
    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            normalized = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = cleaned.replace(/,/g, '');
        }
    } else if (lastComma > -1 && lastDot === -1) {
        normalized = cleaned.replace(',', '.');
    } else {
        normalized = cleaned;
    }
    const val = Number(normalized);
    return Number.isFinite(val) ? val : NaN;
}

function guessCurrencyFromSymbols(strs) {
    const hay = (strs || []).join(' ') || '';
    if (/£/.test(hay)) return 'GBP';
    if (/\$\s?/.test(hay)) return 'USD';
    if (/€/.test(hay)) return 'EUR';
    return null;
}

function pickDiscountVsFull(prices, labels = []) {
    const labelStr = labels.join(' ').toLowerCase();
    if (labelStr.includes('was') && prices.length >= 2) {
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        return { fullPrice: max, discountedPrice: min };
    }
    if (labelStr.includes('now') && prices.length >= 1) {
        const min = Math.min(...prices);
        return { fullPrice: min, discountedPrice: min };
    }
    if (prices.length >= 2) {
        const max = Math.max(...prices);
        const min = Math.min(...prices);
        if (max !== min) return { fullPrice: max, discountedPrice: min };
    }

    const only = prices[0];
    return { fullPrice: only, discountedPrice: only };
}

function safeJsonParse(txt) {
    try {
        return JSON.parse(txt);
    } catch {
        return null;
    }
}

function extractFromJsonLd($) {
    const results = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const txt = $(el).contents().text();
        const parsed = safeJsonParse(txt);
        if (!parsed) return;

        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        for (const node of nodes) {
            results.push(node);
        }
    });

    const product =
        results.find((n) => n['@type'] === 'Product') ||
        results.find((n) => Array.isArray(n['@type']) && n['@type'].includes('Product'));

    if (!product) return null;

    const title = product.name || null;

    const offers = product.offers || [];
    const offersArr = Array.isArray(offers) ? offers : [offers];
    const prices = [];
    let currency = null;
    for (const offer of offersArr) {
        if (offer && offer.price) {
            prices.push(parseNumber(String(offer.price)));
        }
        if (!currency && offer && offer.priceCurrency && typeof offer.priceCurrency === 'string') {
            currency = offer.priceCurrency.toUpperCase();
        }
        const spec = offer && offer.priceSpecification;
        if (spec && spec.price) {
            prices.push(parseNumber(String(spec.price)));
        }
        if (!currency && spec && spec.priceCurrency) {
            currency = String(spec.priceCurrency).toUpperCase();
        }
    }

    const validPrices = prices.filter((p) => Number.isFinite(p));
    if (!title && !validPrices.length && !currency) return null;

    return {
        title: title || null,
        prices: validPrices,
        currency: currency || null,
    };
}

function extractFromDom($) {
    const title =
        $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim() ||
        null;

    // Gather price-related text candidates
    const priceSelCandidates = [
        '[data-test*="price"]',
        '[class*="price"]',
        'span:contains("Was")',
        'span:contains("Now")',
        'div:contains("Was")',
        'div:contains("Now")',
        'meta[itemprop="price"]',
    ];

    const texts = [];
    priceSelCandidates.forEach((sel) => {
        $(sel).each((_, el) => {
            const tag = el.tagName?.toLowerCase();
            if (tag === 'meta') {
                const c = $(el).attr('content');
                if (c) texts.push(c);
            } else {
                const t = $(el).text().trim();
                if (t) texts.push(t);
            }
        });
    });

    const numberRegex = /(-?\d[\d.,]*)/g;
    const prices = [];
    const labels = [];
    texts.forEach((t) => {
        let m;
        while ((m = numberRegex.exec(t))) {
            const num = parseNumber(m[1]);
            if (Number.isFinite(num)) prices.push(num);
        }
        labels.push(t);
    });

    let currency =
        $('meta[property="product:price:currency"]').attr('content') ||
        $('meta[itemprop="priceCurrency"]').attr('content') ||
        null;

    if (!currency) {
        const sym = guessCurrencyFromSymbols(texts);
        if (sym) currency = sym;
    }

    if (currency) currency = currency.toUpperCase();

    return { title: title || null, prices, currency, labels };
}

async function trySelectCountry(page, countryCode) {
    const code = (countryCode || '').toUpperCase();

    try {
        const cookieBtn = await page.locator('button:has-text("Accept")').first();
        if (await cookieBtn.isVisible({ timeout: 2000 })) {
            await cookieBtn.click({ timeout: 2000 });
        }
    } catch { }

    const triggers = [
        'button[aria-label*="Deliver to"]',
        'button[aria-label*="Country"]',
        'button:has-text("Deliver to")',
        'button:has-text("Change")',
        '[data-testid*="country"]',
        '[data-test*="country"]',
        'a[href*="country"]',
    ];

    for (const sel of triggers) {
        try {
            const loc = page.locator(sel).first();
            if (await loc.isVisible({ timeout: 1500 })) {
                await loc.click({ timeout: 1500 });
                break;
            }
        } catch { }
    }

    const countryOptions = [
        `button:has-text("${code}")`,
        `a:has-text("${code}")`,
        `option[value="${code}"]`,
        `option:has-text("${code}")`,
        `li:has-text("${code}")`,
    ];

    for (const cSel of countryOptions) {
        try {
            const opt = page.locator(cSel).first();
            if (await opt.isVisible({ timeout: 1000 })) {
                await opt.click({ timeout: 1000 });
                const applySelectors = [
                    'button:has-text("Apply")',
                    'button:has-text("Save")',
                    'button:has-text("Confirm")',
                    'button:has-text("Update")',
                    'button:has-text("Continue")',
                ];
                for (const aSel of applySelectors) {
                    try {
                        const btn = page.locator(aSel).first();
                        if (await btn.isVisible({ timeout: 800 })) {
                            await btn.click({ timeout: 800 });
                            break;
                        }
                    } catch { }
                }
                break;
            }
        } catch { }
    }

    await page.waitForTimeout(800);
}

async function crawlOne(page, { url, country }) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!response) throw new Error(`No response for ${url}`);
    const status = response.status();
    if (status !== 200) {
        if ([403, 404].includes(status)) {
            throw new Error(`Blocked or not found (${status}) for ${url}`);
        }
        throw new Error(`Unexpected status ${status} for ${url}`);
    }

    await trySelectCountry(page, country);

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const html = await page.content();
    const $ = cheerio.load(html);

    const ld = extractFromJsonLd($);
    const dom = extractFromDom($);

    const title = (ld && ld.title) || dom.title || null;

    let currency =
        (ld && ld.currency) || dom.currency || COUNTRY_CURRENCY[country?.toUpperCase()] || null;

    let prices = (ld && ld.prices) || [];
    if (!prices.length) {
        prices = dom.prices || [];
    }
    prices = prices.filter((p) => Number.isFinite(p));

    if (!prices.length) {
        throw new Error(`Could not find prices at ${url}`);
    }

    const { fullPrice, discountedPrice } = pickDiscountVsFull(prices, dom.labels);

    if (!currency) {
        currency = guessCurrencyFromSymbols([$.text()]) || null;
    }

    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        if (currency === '£') currency = 'GBP';
        if (currency === '$') currency = 'USD';
        if (currency === '€') currency = 'EUR';
    }

    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
        throw new Error(`Could not determine 3-letter currency at ${url}`);
    }

    return {
        url,
        fullPrice: Number(fullPrice),
        discountedPrice: Number(discountedPrice),
        currency,
        title: title || '',
    };
}

async function main() {
    const browser = await chromium.launch({
        headless: false, // Change to true for headless mode
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // Remove for playright bundled Chromium
    });
    const context = await browser.newContext({
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
        locale: 'en-US',
    });

    const page = await context.newPage();

    const results = [];
    for (const entry of urls) {
        try {
            const result = await crawlOne(page, entry);
            results.push(result);
            console.log(`✓ Success: ${entry.url}`);
        } catch (err) {
            console.error(`✗ Error: ${entry.url}\n  -> ${err.message}`);
        }
    }

    await browser.close();

    console.log('\nFinal results:');
    console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
