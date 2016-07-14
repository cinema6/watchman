'use strict';

const waiter = {
    // Polls a Promise waiting until it resolves with a truthy value. This function itself returns
    //     a Promise which resolves with the value of the given polled promise.
    waitFor: function(fn, waitTime) {
        const millis = waitTime || 1000;
        return Promise.resolve(fn()).then(value =>
            value || waiter.delay(millis).then(() => waiter.waitFor(fn, millis))
        );
    },

    // Returns a Promise which resolves once a given amount of time has passed
    delay: function(millis) {
        return new Promise(resolve => setTimeout(() => {
            resolve();
        }, millis));
    }
};
module.exports = waiter;
