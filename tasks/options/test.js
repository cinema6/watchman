'use strict';

const path = require('path');

const watchmanUser = process.env.WATCHMAN_USER || process.env.USER || 'anon';

module.exports = {
    unit: { },
    e2e: {
        options: {
            apiRoot: 'http://33.33.33.10',
            mongoHost: '33.33.33.10',
            timeStream: `devTimeStream-${watchmanUser}`,
            watchmanStream: `devWatchmanStream-${watchmanUser}`,
            cwrxStream: `devCwrxStream-${watchmanUser}`,
            watchmanHost: '33.33.33.20',
            appPrefix: 'dev',
            sshUser: 'vagrant',
            sshKey: path.resolve(process.env.HOME, '.vagrant.d/insecure_private_key')
        }
    }
};
