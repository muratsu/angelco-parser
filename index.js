const fs = require('fs');
const rp = require('request-promise-native');
const cheerio = require('cheerio');
const pThrottle = require('p-throttle');

// Attempt promises with retry
function attemptWithRetry(promiseGenerator, attempts = 5, delay = 10000) {
  return new Promise((resolve, reject) => {
    promiseGenerator()
      .then(resolve)
      .catch((error) => {
        if (attempts > 1) {
          setTimeout(() => {
            resolve(
              attemptWithRetry(promiseGenerator, attempts - 1, delay * 2)
            );
          }, delay);
        } else {
          reject(error);
        }
      });
  });
}

// Fetches all job listings
async function fetchAllListings() {
  const api = "https://angel.co/job_listings/startup_ids";
  const options = {
    method: 'POST',
    uri: api,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.75 Safari/537.36'
    },
    formData: {
      'filter_data[locations][]': "1624-California%2C+US",
      'filter_data[types][]': "full-time",
      'tab': "find"
    },
    json: true
  };

  const queryResult = await rp(options);
  const jobs = [];
  queryResult.ids.forEach((val, idx) => {
    jobs.push({
      companyId: val,
      listingIds: queryResult.listing_ids[idx]
    });
  })
  return jobs;
}

// Fetched all all the listings of a company in more detail
async function fetchCompanyListings(listing) {
  console.log(`Fetching jobs for company ${listing.companyId}`)
  const jobs = [];
  const startupId = `startup_ids%5B%5D=${listing.companyId}`;
  const listingIds = listing.listingIds.reduce((acc, cur) => {
    return acc + "&listing_ids%5B0%5D%5B%5D=" + cur;
  }, '');
  const target = `https://angel.co/job_listings/browse_startups_table?${startupId}${listingIds}`;
  const options = {
    uri: target,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.75 Safari/537.36'
    },
  };
  return new Promise(async (resolve, reject) => {
    try {
      const queryResult = await rp(options);
      const $ = cheerio.load(queryResult);
      const companyName = $('.header-info .startup-link').text();
      const companyPage = $('.header-info .startup-link').attr('href');
      // Iterate all listings
      $('.jobs > .content > .listing-row').each((idx, elem) => {
        const job = {};
        const title = $(elem).find('.title > a');
        // Company Details
        job.company = {
          name: companyName,
          link: companyPage
        };
        // Extract Title
        job.link = title.attr('href');
        job.title = title.text();
        // Extract Compenstation
        const compenstation = $(elem).find('.compensation').text().trim().split(' · ');
        job.salary = compenstation[0];
        job.stock = compenstation[1];
        // Extract Tags
        job.tags = $(elem).find('.tags').text().trim().split(' · ');
        jobs.push(job);
      });
      resolve(jobs);
    } catch (error) {
      reject(error);
    }
  })
}

const main = async () => {
  console.log('Fetching listings.');
  const jobs = await fetchAllListings();
  console.log('Fetching completed.');

  // const companyJobs = await fetchCompanyListings(jobs[0]);
  // var wstream = fs.createWriteStream('output.json');

  // Run job fetchers
  for (job of jobs) {
    const jobJSON = await attemptWithRetry(() => fetchCompanyListings(job));
    fs.appendFileSync('output.json', `${JSON.stringify(jobJSON)}\n`);
  }
  // await Promise.all(throttled);

  // wstream.write('Another line\n');
  // wstream.end();

  // {
  //   return fetchCompanyListings(job).then(jobJSON => {
  //     wstream.write(`${jobJSON}\n`);
  //     return Promise.resolve();
  //   })
  // }))


};

main();
