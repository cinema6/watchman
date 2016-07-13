'use strict';

const waiter = {
    // Polls a Promise waiting until it resolves with a truthy value. This function itself returns
    //     a Promise which resolves with the value of the given polled promise.
    waitFor: function(fn, waitTime) {
        return Promise.resolve(fn()).then(value => {
            return value || new Promise((resolve, reject) => {
                setTimeout(() => {
                    waiter.waitFor(fn, waitTime).then(resolve, reject);
                }, waitTime);
            });
        });
    }
};
module.exports = waiter;
