'use strict';

const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;

function getOrgId(data) {
    if (data.transaction) {
        return data.transaction.org;
    }

    throw new Error(`Couldn\'t find an org with event data: keys(${inspect(Object.keys(data))})`);
}

module.exports = config => {
    const showcase = require('../../../../lib/showcase')(config);
    const log = logger.getLog();

    return event => Promise.resolve().then(() => {
        const orgId = getOrgId(event.data);

        return showcase.rebalance(orgId).catch(reason => log.error(
            'Failed to rebalance org(%1): %2',
            orgId, inspect(reason)
        ));
    })
    .catch(reason => log.error(
        'Could not rebalance: %1',
        inspect(reason)
    ))
    .then(() => undefined);
};
