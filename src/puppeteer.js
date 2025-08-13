/**
 * 1) -----------------------------------------------------------------------------------------------------------
 *      Use puppeteer navigate to the following urls.
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
 *
 * 2) -----------------------------------------------------------------------------------------------------------
 *      Extract product options (from the select form) and log them
 *      Select/click on the second option (if the second one doesn't exist, select/click the first)
 *
 *      Log options example:
 *      [
 *          {
 *              value: 'Blu - L/XL',
 *              optionValue: '266,1033', // Attribute "value" of option element
 *          }
 *      ]
 * --------------------------------------------------------------------------------------------------------------
 */

const urls = [
    'https://www.outdoorsrlshop.it/catalogo/1883-trekker-rip.html',
    'https://www.outdoorsrlshop.it/catalogo/2928-arco-man-t-shirt.html'
];

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

function parseNumber(str) {
    if (!str) return NaN;
    let cleaned = str.replace(/[^0-9.,-]/g, '');
    if (cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
        cleaned = cleaned.replace(/,/g, '');
    }
    return Number(cleaned);
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });

    for (const url of urls) {
        const page = await browser.newPage();

        let statusCode;
        page.on('response', async (response) => {
            if (response.url() === url) {
                statusCode = response.status();
            }
        });

        const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
        statusCode = statusCode || res.status();

        if (statusCode !== 200) {
            if ([403, 404].includes(statusCode)) {
                console.error(`Error ${statusCode} at ${url}`);
                await page.close();
                continue;
            } else {
                throw new Error(`Unexpected status ${statusCode} at ${url}`);
            }
        }

        const html = await page.content();
        const $ = cheerio.load(html);

        const title = $('h1').first().text().trim();

        let priceTexts = [];
        $('[itemprop="price"], .price').each((_, el) => {
            const txt = $(el).text().trim();
            if (txt) priceTexts.push(txt);
        });
        priceTexts = [...new Set(priceTexts)];

        let fullPrice, discountedPrice;

        if (priceTexts.length >= 2) {
            const nums = priceTexts.map(parseNumber).filter(n => !isNaN(n));
            fullPrice = Math.max(...nums);
            discountedPrice = Math.min(...nums);
        } else {
            const num = parseNumber(priceTexts[0]);
            fullPrice = num;
            discountedPrice = num;
        }

        let currency = $('[itemprop="priceCurrency"]').attr('content');
        if (!currency) {
            if (/€/.test(priceTexts.join(' '))) currency = 'EUR';
            else if (/£/.test(priceTexts.join(' '))) currency = 'GBP';
            else if (/\$/.test(priceTexts.join(' '))) currency = 'USD';
        }

        const result = {
            url,
            fullPrice,
            discountedPrice,
            currency,
            title
        };

        console.log('Product Data:', result);

        const optionsData = [];
        const selectEl = await page.$('select');
        if (selectEl) {
            const options = await page.$$eval('select option', opts =>
                opts.map(o => ({
                    value: o.innerText.trim(),
                    optionValue: o.getAttribute('value')
                }))
            );

            options.forEach(o => optionsData.push(o));
            console.log('Options:', optionsData);

            if (optionsData.length > 1) {
                await page.select('select', optionsData[1].optionValue);
            } else if (optionsData.length > 0) {
                await page.select('select', optionsData[0].optionValue);
            }
        } else {
            console.log('No select options found.');
        }

        await page.close();
    }

    await browser.close();
})();
