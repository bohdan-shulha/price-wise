/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Entry point for the background script. Registers listeners for various
 * background tasks, such as extracting prices from webpages or alerting the
 * user of a new price alert.
 * @module
 */

import config from 'commerce/config';
import {handleExtractedProductData} from 'commerce/background/extraction';
import {handleNotificationClicked, handlePriceAlerts} from 'commerce/background/price_alerts';
import {handleWebRequest, updatePrices} from 'commerce/background/price_updates';
import store from 'commerce/state';
import {loadStateFromStorage} from 'commerce/state/sync';

(async function main() {
  // Set browser action default badge color, which can't be set via manifest
  browser.browserAction.setBadgeBackgroundColor({
    color: await config.get('badgeAlertBackground'),
  });

  // Setup product extraction listener
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.from === 'content' && message.subject === 'ready') {
      handleExtractedProductData(message.extractedProduct, sender);
    }
  });

  // Display price alerts when they are inserted into the state.
  // This includes the initial load from extension storage below.
  store.subscribe(handlePriceAlerts);

  // Open the product page when an alert notification is clicked.
  browser.notifications.onClicked.addListener(handleNotificationClicked);

  // Enable content scripts now that the background listener is registered.
  // Store the return value globally to avoid destroying it, which would
  // unregister the content scripts.
  window.registeredContentScript = browser.contentScripts.register({
    matches: ['<all_urls>'],
    js: [
      {file: 'product_info.bundle.js'},
    ],
    runAt: 'document_idle',
    allFrames: true,
  });

  // Set up web request listener to modify framing headers for background updates
  const webRequestFilter = {
    urls: ['<all_urls>'],
    types: ['sub_frame'],
    tabId: browser.tabs.TAB_ID_NONE,
  };
  browser.webRequest.onHeadersReceived.addListener(
    handleWebRequest,
    webRequestFilter,
    ['blocking', 'responseHeaders'],
  );

  // Make sure the store is loaded before we check prices.
  await store.dispatch(loadStateFromStorage());

  // Update product prices while the extension is running, including once during
  // startup.
  updatePrices();
  setInterval(updatePrices, await config.get('priceCheckTimeoutInterval'));
}());
