'use strict';

var watchmanUser = process.env.WATCHMAN_USER || process.env.USER || 'anon';

module.exports = {
    unit: { },
    e2e: {
        options: {
            apiRoot: 'http://33.33.33.10/',
            mongoHost: '33.33.33.10',
            timeStream: 'devTimeStream-' + watchmanUser,
            watchmanStream: 'devWatchmanStream-' + watchmanUser,
            cwrxStream: 'devCwrxStream-' + watchmanUser
        }
    }
};
