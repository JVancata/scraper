// These features would be a nice plus:
// TODO: Keep the while at all costs
// TODO: ./ urls
// TODO: ../ urls
// TODO: DIFF the files and throw it away if it is the same file.
// TODO: Command line options
// TODO: MAX_URLS

const startTime = new Date();

const axios = require("axios");
const { createWriteStream, existsSync } = require("fs");

const urlRegex = /(http[s]:\/\/[a-zA-Z0-9.]*[.][a-z]*[a-zA-Z0-9\/?+\-%=.]*)/gi;
const supportUrlRegex = /href="[a-zA-Z0-9\/?+\-%=.]*"/gi;
const imgRegex = /([a-zA-Z0-9 \-.',ěščřžýáí=\/])+\.(jpg|png|jpeg|gif)/gi;

const arrayOfUrlsToCheck = [];
const arrayOfUrlItems = [];
const arrayOfMediaToDownload = [];

// Parsing the entry arguments
const arguments = process.argv;

if (!Array.isArray(arguments)) {
    console.log("Fatal error! Exiting process...");
    process.exit();
}

// Default
const settings = {
    SAME_DOMAIN: true,
    MAX_DEPTH: 1,
    MAX_URLS: -1
}

let entryPoint = arguments[arguments.length - 1];

arguments.forEach((argument, index) => {
    let nextArgument = "";
    let parsed = 0;
    switch (argument) {
        case "-help":
            console.log(`Usage: node main.js [options] [entryPoint]
Options:
-s - do not restrict search to only entry point domain
-m - sets the maximum number of urls to check, -1 is for unlimited. Defaults to ${settings.MAX_URLS}
-d - maximal depth of urls to crawl, defaults to ${settings.MAX_URLS}
-help - prints this dialog.`);
            process.exit();
            break;
        case "-s":
            settings.SAME_DOMAIN = false;
            break;
        case "-m":
            nextArgument = arguments[index + 1];
            parsed = parseInt(nextArgument);
            if (!Number.isInteger(parsed) || (parsed < 0 && parsed !== -1)) {
                console.log(`Argument -m must be a valid number from 1 to ${Number.MAX_SAFE_INTEGER} (or -1)! Exiting process...`);
                process.exit();
            }
            settings.MAX_URLS = parsed;
            break;
        case "-d":
            nextArgument = arguments[index + 1];
            parsed = parseInt(nextArgument);
            if (!Number.isInteger(parsed) || parsed < 0) {
                console.log(`Argument -d must be a valid number from 1 to ${Number.MAX_SAFE_INTEGER}! Exiting process...`);
                process.exit();
            }
            settings.MAX_DEPTH = parsed;
            break;
    }
});

if (!entryPoint.startsWith("http")) {
    console.log("Entry point must be a http(s) URL! Try -help for help. Exiting process...");
    process.exit();
}

console.log("Entry point is set as: ", entryPoint);
//console.log("Settings: ", settings);

const downloadFile = async (url) => {
    try {
        const res = await axios({
            method: 'GET',
            responseType: 'stream',
            url
        });

        // Create filename
        const splittedUrl = url.split("/");
        let fileName = splittedUrl[splittedUrl.length - 1];
        // Check if the file exists
        let fileNamePrepend = fileName;
        let toPrependToFileName = 0;
        while (existsSync(`./downloads/${fileNamePrepend}`)) {
            // TODO: DIFF the files and throw it away if it is the same file.
            toPrependToFileName++;
            fileNamePrepend = `${toPrependToFileName}-${fileName}`;
        }

        res.data.pipe(createWriteStream(`downloads/${fileNamePrepend}`));
    }
    catch (e) {
        console.log(`Error while downloading ${url}`)
    }
}

const getData = async ({ url, depth }) => {

    // Too deep (+1 for images)
    if (depth > settings.MAX_DEPTH + 1) return null;

    let res;

    try {
        res = await axios.get(url);
        console.log(`${res.status} - D:${depth} - ${url}`);
    }
    catch (e) {
        console.log(`${e.response && e.response.status ? e.response.status : "Err"} - D:${depth} - ${url}`);
        return;
    }

    if (res && res.data && typeof res.data === "string") {

        // Images
        const imgResult = res.data.match(imgRegex);
        if (imgResult) {
            imgResult.map((resImg) => {
                // The regex returns filename with quotes
                const noQuote = resImg.replace(/"/g, '');
                const correctUrl = getCorrectUrl({ originUrl: url, url: noQuote }, true);

                // If already has this URL/Image, do not add to array
                if (!correctUrl || arrayOfMediaToDownload.includes(correctUrl)) {
                    return;
                }

                arrayOfMediaToDownload.push(correctUrl);
            });
        }

        // Too deep
        if (depth > settings.MAX_DEPTH) return null;

        // Urls
        const urlResult = res.data.match(urlRegex)
        if (urlResult) {
            urlResult.map((resUrl) => {

                // Same-domain setting
                urlRegex.lastIndex = 0;
                if (settings.SAME_DOMAIN && urlRegex.test(resUrl) && !resUrl.startsWith(entryPoint)) {
                    return null;
                }

                const noQuote = resUrl.replace(/"/g, '');
                const correctUrl = getCorrectUrl({ originUrl: url, url: noQuote });

                // If already has this URL/Image, do not add to array
                if (!correctUrl || arrayOfUrlsToCheck.includes(correctUrl)) {
                    return;
                }

                arrayOfUrlsToCheck.push(correctUrl);
                arrayOfUrlItems.push({ url: correctUrl, depth: depth + 1 });
            });
        }

        // Support URLs
        const supportResult = res.data.match(supportUrlRegex);
        if (supportResult) {
            supportResult.map((resUrl) => {

                // Same-domain setting
                urlRegex.lastIndex = 0;
                if (settings.SAME_DOMAIN && urlRegex.test(resUrl) && !resUrl.startsWith(entryPoint)) {
                    return null;
                }

                const noQuote = resUrl.replace(/"/g, '').replace("href=", "");
                const correctUrl = getCorrectUrl({ originUrl: url, url: noQuote });

                // If already has this URL/Image, do not add to array
                if (!correctUrl || arrayOfUrlsToCheck.includes(correctUrl)) {
                    return;
                }

                arrayOfUrlsToCheck.push(correctUrl);
                arrayOfUrlItems.push({ url: correctUrl, depth: depth + 1 });
            });
        }

    }
}

const getCorrectUrl = (urlObject, isImage = false) => {
    let { originUrl, url } = urlObject;

    let correctUrl = "";

    // Same-domain setting
    urlRegex.lastIndex = 0;

    if (urlRegex.test(url) && !url.startsWith("//")) {
        return url;
    }

    if (url.startsWith("//")) {
        correctUrl = `https:${url}`;
        return correctUrl;
    }

    if (originUrl[originUrl.length - 1] === '/' && url[0] !== '/') {
        // Pretty url with domain.com/+url
        correctUrl = `${originUrl}${url}`;
    }
    else if (url[0] === '/') {
        // Also solves if the originalUrl has last character slash
        // Slash on end = must request from root

        // getting the root
        const splittedArr = originUrl.split("/");
        const rootUrl = splittedArr.slice(0, 3).join("/");

        correctUrl = `${rootUrl}${url}`;
    }
    else if (url[0] !== '/') {
        // must replace the current filename with the url
        let splittedArr = originUrl.split("/");
        if (splittedArr.length > 3) {
            splittedArr = splittedArr.splice(0, splittedArr.length - 1);
        }
        correctUrl = `${splittedArr.join("/")}/${url}`;
    }

    if (!isImage && settings.SAME_DOMAIN && !correctUrl.startsWith(entryPoint)) {
        return null;
    }

    return correctUrl;
}

const main = async () => {
    await getData({ url: entryPoint, depth: 0 });

    // Max URLS limit
    const limit = settings.MAX_URLS === -1 ? Number.MAX_SAFE_INTEGER : settings.MAX_URLS;

    // Looping through the URLs to crawl
    let urlIndex = 0;
    while (urlIndex !== arrayOfUrlItems.length && urlIndex < limit) {
        const urlItem = arrayOfUrlItems[urlIndex];

        await getData(urlItem);

        urlIndex++;
    }

    // Looping through the images to scrape
    let imgIndex = 0;
    while (imgIndex !== arrayOfMediaToDownload.length) {
        const imgItem = arrayOfMediaToDownload[imgIndex];

        console.log("Downloading... " + imgItem);
        await downloadFile(imgItem);

        imgIndex++;
    }

    const stopTime = new Date();
    const totalRunTime = Math.round((stopTime - startTime) / 1000);
    console.log(`${arrayOfUrlItems.length} urls found and ${arrayOfMediaToDownload.length} media files scraped with depth ${settings.MAX_DEPTH} and entry point ${entryPoint} in ${totalRunTime} seconds!`);
}

main();