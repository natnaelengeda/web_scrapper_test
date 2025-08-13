/**
 * 1) -----------------------------------------------------------------------------------------------------------
 *      Use got-scraping to crawl in sequence the following urls.
 *      Check response status code (200, 404, 403), proceed only in case of code 200, throw an error in other cases.
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
 *          currency: 'EUR',
 *          title: 'Abito Bianco con Stampa Grafica e Scollo a V Profondo'
 *      }
 * --------------------------------------------------------------------------------------------------------------
 * 2) -----------------------------------------------------------------------------------------------------------
 *      Like the first exercise but the urls must be crawled in parallel
 * --------------------------------------------------------------------------------------------------------------
 */

const urls = [
    'https://www.miinto.it/p-de-ver-s-abito-slip-3059591a-7c04-405c-8015-0936fc8ff9dd',
    'https://www.miinto.it/p-abito-a-spalline-d-jeny-fdac3d17-f571-4b55-8780-97dddf80ef35',
    'https://www.miinto.it/p-abito-bianco-con-stampa-grafica-e-scollo-a-v-profondo-2b03a3d9-fab1-492f-8efa-9151d3322ae7',
    'https://www.miinto.it/donna', // I added this url cause the first three urls are empty
    'https://www.miinto.it/p-borsa-a-mano-sicilia-grande-43d32b83-c648-4568-9a40-648a88ad2bf6', // I added this url cause the first three urls are empty
];


const { gotScraping } = require('got-scraping');
const cheerio = require('cheerio');

function parseEuropeanNumber(str) {
    if (typeof str === 'number') return str;
    if (!str) return NaN;
    let s = String(str).trim();
    s = s.replace(/[^\d.,-]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (lastComma > -1 && lastDot === -1) {
        s = s.replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

function guessCurrencyFromStrings(arrOrStr) {
    const s = Array.isArray(arrOrStr) ? arrOrStr.join(' ') : String(arrOrStr || '');
    if (/€/.test(s)) return 'EUR';
    if (/£/.test(s)) return 'GBP';
    if (/\$/.test(s)) return 'USD';
    return null;
}

function safeJSON(txt) {
    try {
        return JSON.parse(txt);
    } catch (e) {
        return null;
    }
}

function extractFromJsonLd($) {
    const nodes = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const txt = $(el).contents().text();
        const parsed = safeJSON(txt);
        if (!parsed) return;
        if (Array.isArray(parsed)) nodes.push(...parsed);
        else nodes.push(parsed);
    });
    const product = nodes.find(n => n && (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product'))));
    if (!product) return null;
    const title = product.name || null;
    let prices = [];
    let currency = null;
    const offers = product.offers ? (Array.isArray(product.offers) ? product.offers : [product.offers]) : [];
    for (const o of offers) {
        if (o?.price) prices.push(parseEuropeanNumber(String(o.price)));
        if (!currency && o?.priceCurrency) currency = String(o.priceCurrency).toUpperCase();
        if (o?.priceSpecification) {
            const spec = o.priceSpecification;
            if (spec.price) prices.push(parseEuropeanNumber(String(spec.price)));
            if (!currency && spec.priceCurrency) currency = String(spec.priceCurrency).toUpperCase();
        }
    }
    prices = prices.filter(Number.isFinite);
    return { title, prices, currency };
}

function extractSingleProduct($) {
    const title =
        $('h1').first().text().trim() ||
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim() ||
        '';

    const priceTexts = new Set();

    $('[data-testid="product-price"]').each((_, el) => {
        const t = cheerio(el).text().replace(/\u00A0/g, ' ').trim();
        if (t) priceTexts.add(t);
    });

    $('[itemprop="price"]').each((_, el) => {
        const tag = el.tagName?.toLowerCase();
        if (tag === 'meta') {
            const c = cheerio(el).attr('content');
            if (c) priceTexts.add(String(c).trim());
        } else {
            const t = cheerio(el).text().trim();
            if (t) priceTexts.add(t);
        }
    });
    $('meta[itemprop="priceCurrency"], meta[property="product:price:currency"]').each((_, el) => {
        const c = cheerio(el).attr('content');
        if (c) priceTexts.add(c.trim());
    });

    $('[class*="price"], [data-test*="price"]').each((_, el) => {
        const t = cheerio(el).text().replace(/\u00A0/g, ' ').trim();
        if (t) priceTexts.add(t);
    });

    const prices = [];
    for (const t of priceTexts) {
        const matches = String(t).match(/-?\d[\d.,]*/g) || [];
        for (const m of matches) {
            const n = parseEuropeanNumber(m);
            if (Number.isFinite(n)) prices.push(n);
        }
    }

    let currency = $('meta[itemprop="priceCurrency"]').attr('content') || $('meta[property="product:price:currency"]').attr('content') || null;
    if (!currency) {
        currency = guessCurrencyFromStrings([...priceTexts]) || null;
    }
    if (currency) currency = currency.toUpperCase();

    let fullPrice = NaN, discountedPrice = NaN;
    const uniq = [...new Set(prices)];
    if (uniq.length === 0) {
    } else if (uniq.length === 1) {
        fullPrice = discountedPrice = uniq[0];
    } else {
        fullPrice = Math.max(...uniq);
        discountedPrice = Math.min(...uniq);
    }

    return {
        title,
        fullPrice: Number(fullPrice),
        discountedPrice: Number(discountedPrice),
        currency
    };
}

function extractGridProducts($) {
    const products = [];
    $('div[data-testid^="product-"][data-testid$="-prices"]').each((_, el) => {
        const container = cheerio(el);
        const pid = container.attr('data-testid') || null;

        const currentSel = container.find('[data-testid$="-prices-current"]');
        const prevSel = container.find('[data-testid$="-prices-previous"]');

        const currentText = currentSel.text().replace(/\u00A0/g, ' ').trim() || null;
        const prevText = prevSel.text().replace(/\u00A0/g, ' ').trim() || null;

        const currNum = currentText ? parseEuropeanNumber(currentText.match(/-?\d[\d.,]*/)?.[0]) : NaN;
        const prevNum = prevText ? parseEuropeanNumber(prevText.match(/-?\d[\d.,]*/)?.[0]) : NaN;

        let discountedPrice = Number.isFinite(currNum) ? currNum : NaN;
        let fullPrice = Number.isFinite(prevNum) ? prevNum : discountedPrice;

        if (!Number.isFinite(fullPrice) && !Number.isFinite(discountedPrice)) {
            const matches = container.text().match(/-?\d[\d.,]*/g) || [];
            const numbers = matches.map(m => parseEuropeanNumber(m)).filter(Number.isFinite);
            if (numbers.length === 1) fullPrice = discountedPrice = numbers[0];
            else if (numbers.length >= 2) {
                fullPrice = Math.max(...numbers);
                discountedPrice = Math.min(...numbers);
            }
        }

        const currency = guessCurrencyFromStrings([currentText, prevText]) || 'EUR';
        products.push({
            productId: pid,
            fullPrice: Number(fullPrice),
            discountedPrice: Number(discountedPrice),
            currency
        });
    });

    return products;
}

async function fetchUrl(url) {
    const res = await gotScraping({
        url,
        throwHttpErrors: false,
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36',
            'accept-language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        http2: true,
        retry: { limit: 0 },
        timeout: { request: 30000 }
    });

    const status = res.statusCode;
    if (status !== 200) {
        if (status === 403 || status === 404) {
            throw new Error(`Blocked or not found (${status}) at ${url}`);
        }
        throw new Error(`Unexpected status ${status} at ${url}`);
    }

    return res.body;
}

async function crawlOnce(url) {
    const body = await fetchUrl(url);
    const $ = cheerio.load(body);

    const ld = extractFromJsonLd($);

    const gridNodes = $('div[data-testid^="product-"][data-testid$="-prices"]');
    const isGrid = gridNodes.length > 0;

    if (isGrid) {
        const products = extractGridProducts($);
        return {
            url,
            isGrid: true,
            products
        };
    } else {
        if (ld && Array.isArray(ld.prices) && ld.prices.length >= 1) {
            const uniq = [...new Set(ld.prices)];
            let fullPrice, discountedPrice;
            if (uniq.length === 1) fullPrice = discountedPrice = uniq[0];
            else {
                fullPrice = Math.max(...uniq);
                discountedPrice = Math.min(...uniq);
            }
            const currency = ld.currency && /^[A-Z]{3}$/.test(ld.currency) ? ld.currency : (guessCurrencyFromStrings($.text()) || 'EUR');
            const title = ld.title || ($('h1').first().text().trim() || '');
            return {
                url,
                isGrid: false,
                title,
                fullPrice: Number(fullPrice),
                discountedPrice: Number(discountedPrice),
                currency
            };
        }

        const single = extractSingleProduct($);

        let currency = single.currency;
        if (!currency || !/^[A-Z]{3}$/.test(currency)) {
            currency = guessCurrencyFromStrings($.text()) || 'EUR';
        }

        return {
            url,
            isGrid: false,
            title: single.title,
            fullPrice: Number(single.fullPrice),
            discountedPrice: Number(single.discountedPrice),
            currency
        };
    }
}


async function crawlSequential(urlList) {
    const results = [];
    for (const u of urlList) {
        try {
            console.log(`-> Fetching (sequential): ${u}`);
            const r = await crawlOnce(u);
            results.push(r);
            console.log(`   ✓ OK: ${u}`);
        } catch (err) {
            console.error(`   ✗ Error at ${u}: ${err.message}`);
            throw err;
        }
    }
    return results;
}

async function crawlParallel(urlList) {
    console.log('-> Fetching in parallel...');
    const settled = await Promise.allSettled(urlList.map(u => crawlOnce(u)));
    const successes = [];
    const errors = [];
    settled.forEach((s, idx) => {
        if (s.status === 'fulfilled') successes.push(s.value);
        else errors.push({ url: urlList[idx], error: s.reason?.message || String(s.reason) });
    });
    if (errors.length) {
        const err = new Error(`Parallel crawl had ${errors.length} error(s).`);
        err.details = { errors, successes };
        throw err;
    }
    return successes;
}

(async () => {
    try {
        console.log('=== Sequential Crawl ===');
        const seq = await crawlSequential(urls);
        console.log(JSON.stringify(seq, null, 2));
    } catch (e) {
        console.error('Sequential crawl failed:', e.message);
    }

    try {
        console.log('\n=== Parallel Crawl ===');
        const par = await crawlParallel(urls);
        console.log(JSON.stringify(par, null, 2));
    } catch (e) {
        console.error('Parallel crawl failed:', e.message);
        if (e.details) {
            console.error('Details:', JSON.stringify(e.details.errors, null, 2));
            console.log('Successful results so far:');
            console.log(JSON.stringify(e.details.successes, null, 2));
        }
    }
})();
