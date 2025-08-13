/**
 * 1) -----------------------------------------------------------------------------------------------------------
 *      Analyze browser Network Tab to find apis of the following urls.
 *      Tips: extract the productId from the url string.
 *      Use gotScraping to make a request to those apis.
 *
 *      Parse the json and extract:
 *          - fullPrice (it has to be a number)
 *          - discountedPrice (it has to be a number, if it does not exist same as fullPrice)
 *          - currency (written in 3 letters [GBP, USD, EUR...])
 *          - title (product title)
 *
 *      Result example
 *      {
 *          url: ${urlCrawled},
 *          apiUrl: ${apiUrl},
 *          fullPrice: 2000.12,
 *          discountedPrice: 1452.02,
 *          currency: 'GBP',
 *          title: 'Aqualung Computer subacqueo i330R'
 *      }
 * --------------------------------------------------------------------------------------------------------------
 */

// const urls = [
//     'https://www.stoneisland.com/en-it/collection/polos-and-t-shirts/slim-fit-short-sleeve-polo-shirt-2sc17-stretch-organic-cotton-pique-81152SC17A0029.html',
//     'https://www.stoneisland.com/en-it/collection/polos-and-t-shirts/short-sleeve-polo-shirt-22r39-50-2-organic-cotton-pique-811522R39V0097.html'
// ];

const urls = [
    'https://www.stoneisland.com/en-it/collection/polos-and-t-shirts/2100001-heavy-cotton-jersey-60-recycled-stone-island-raw-beauty-K2S152100001S00T3V0099.html',
    'https://www.stoneisland.com/en-it/collection/polos-and-t-shirts/regular-fit-short-sleeve-t-shirt-with-compass-patch-2100025-combed-organic-cotton-jersey-K2S152100025S0115V0080.html'
];

const { gotScraping } = require('got-scraping');

const fetchProductData = async (url) => {
    try {
        const productId = url.split('-').pop().split('.html')[0];
        const backendApi = `https://www.stoneisland.com/on/demandware.store/Sites-StoneEU-Site/en_IT/ProductApi-Product?pid=${productId}&cachekill=${Date.now()}`;

        const productData = await gotScraping
            .get(backendApi);

        const parsedResult = JSON.parse(productData.body);

        const result = {
            url: url,
            apiUrl: backendApi,
            fullPrice: parsedResult.price.sales.value,
            discountedPrice: parsedResult.price.sales.value || parsedResult.price.sales.value,
            currency: parsedResult.price.sales.currency,
            title: parsedResult.productName
        };

        console.log(result)
        return { result };
    } catch (error) {
        console.error('Error fetching product data:', error);
    }
};

const results = [];

for (const url of urls) {
    try {
        const result = fetchProductData(url);
        results.push(result);
        console.log(`✓ Success: ${url}`);
    } catch (err) {
        console.error(`✗ Error: ${url}\n  -> ${err.message}`);
    }
}

