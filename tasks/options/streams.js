'use strict';

module.exports = {
    options: {
        waitTime: 5000,
        streams: ['e2eTimeStream', 'e2eWatchmanStream'],
        tables: ['e2eTimeStreamApplication', 'e2eWatchmanStreamApplication']
    },
    create: { },
    destroy: { }
};
