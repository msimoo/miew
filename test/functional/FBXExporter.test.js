/* global miew */
import webdriver from 'selenium-webdriver';
import ieDriver from 'selenium-webdriver/ie';
import chromeDriver from 'selenium-webdriver/chrome';
import fs from 'fs';
import express from 'express';
import path from 'path';

import chai, { expect } from 'chai';
import dirtyChai from 'dirty-chai';

import EmptyPage from '../e2e/pages/empty.page';

chai.use(dirtyChai);

let driver = null;
let localhost = null;
let page;

const testReps = [{
  name: 'CR',
  opts: {
    load: '../data/1CRN.pdb',
    reps: [{
      mode: 'TU',
      colorer: 'SQ',
      material: 'SF',
    }],
  },
}, {
  name: 'SE',
  opts: {
    load: '../data/1CRN.pdb',
    reps: [{ mode: 'SE', colorer: 'SQ', material: 'SF' }],
  },
}];

function _prepareBrowser(width = 1024, height = 768) {
  const getPadding = 'return[window.outerWidth-window.innerWidth,window.outerHeight-window.innerHeight];';
  return driver.executeScript(getPadding)
    .then((pad) => driver.manage().window().setRect({ width: width + pad[0], height: height + pad[1] }))
    .then(() => driver.getCapabilities())
    .then((caps) => {
      const browserName = caps.get('browserName').replace(/\b\w/g, (c) => c.toUpperCase());
      const version = caps.get('version') || caps.get('browserVersion') || '(unknown version)';
      const platform = caps.get('platform') || caps.get('platformName') || 'unspecified platform';
      return `${browserName} ${version} for ${platform}`;
    });
}

function _prepareServer(cfg) {
  if (cfg.url) {
    return Promise.resolve(cfg.url);
  }
  if (!fs.existsSync(path.join(cfg.localPath, 'index.html'))) {
    throw new URIError(`App is not found in ${cfg.localPath}, did you forget to build it?`);
  }
  const app = express();
  app.use('/', express.static(cfg.localPath));
  app.use('/data', express.static(path.resolve(__dirname, '../data')));
  return new Promise((resolve) => {
    localhost = app.listen(cfg.localPort, () => {
      resolve(`http://localhost:${cfg.localPort}`);
    });
  });
}

function startup(webDriver, cfg) {
  driver = webDriver;

  return _prepareBrowser()
    .then(() => _prepareServer(cfg))
    .then((url) => url);
}

function shutdown() {
  return driver.quit()
    .then(() => {
      driver = null;
      if (localhost) {
        localhost.close();
        localhost = null;
      }
    });
}


function fbxDownload(fn) {
  return function () {
    return page.reload()
      .then(() => page.waitForMiew())
      .then(() => driver.executeScript(fn))
      .then(() => page.waitUntilRebuildIsDone())
      // clean
      .then(() => driver.executeScript(() => { miew.save({ fileType: 'fbx' }); }))
      .then(() => page.waitForExport(path.resolve(__dirname, '../1CRN.fbx')))
      .then(() => {
        let goldenFBXData = fs.readFileSync(path.resolve(__dirname, './goldenFBX/1CRN.fbx'), 'utf8');
        let currentFBXData = fs.readFileSync(path.resolve(__dirname, '../1CRN.fbx'), 'utf8');
        const usefulInfoGoldenInd = goldenFBXData.indexOf('Object properties');
        const usefulInfoCurrentInd = currentFBXData.indexOf('Object properties');
        goldenFBXData = goldenFBXData.slice(usefulInfoGoldenInd);
        currentFBXData = currentFBXData.slice(usefulInfoCurrentInd);
        expect(goldenFBXData).equal(currentFBXData);
      });
  };
}

describe('The FBX exporter', function () {
  this.timeout(0);
  this.slow(1000);

  const cfg = {
    title: 'FBX Tests',
    report: 'report-fbxExporter.html',
    url: null, // 'https://miew.opensource.epam.com/master',
    localPath: path.resolve(__dirname, '../../build'),
    localPort: 8008,
    threshold: 0,
  };

  before(() => {
    const chromeOptions = new chromeDriver.Options();
    chromeOptions.addArguments(['--disable-gpu']);
    chromeOptions.setUserPreferences({ 'download.default_directory': path.resolve(__dirname, '../') });

    driver = new webdriver.Builder()
      .forBrowser('chrome')
      .setIeOptions(new ieDriver.Options().requireWindowFocus(true).enablePersistentHover(false))
      .setChromeOptions(chromeOptions) // '--headless'
      .build();

    return startup(driver, cfg)
      .then((url) => {
        page = new EmptyPage(driver, `${url}/examples/empty.html`);
        return page.waitForMiew();
      });
  });

  after(() => shutdown());

  const myscript = function (opts) {
    const _opts = opts;
    return function () {
      window.miew = new window.Miew(_opts);
      if (miew.init()) {
        miew.run();
      }
    };
  };

  for (let i = 0; i < testReps.length; i++) {
    it(testReps[i].name, fbxDownload(myscript(testReps[0].opts)));
  }
});
