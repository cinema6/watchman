'use strict';

const BeeswaxClient = require('beeswax-client');
const get = require('lodash/get');
const inspect = require('util').inspect;
const logger = require('cwrx/lib/logger');

module.exports = function factory(config) {
    const beeswax = new BeeswaxClient({
        apiRoot: config.beeswax.apiRoot,
        creds: config.state.secrets.beeswax
    });
    const log = logger.getLog();

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const campaign = data.campaign;
        const beeswaxCampaignId = get(campaign, 'externalCampaigns.beeswax.externalId');

        if (!beeswaxCampaignId) {
            log.info(
                'Not cleaning up beeswax entities for ' +
                `campaign(${campaign.id}) because it has no beeswax campaign id.`
            );

            return undefined;
        }

        log.info(
            `Cleaning up beeswax items for campaign(${campaign.id})/beeswax(${beeswaxCampaignId})`
        );

        return beeswax.lineItems.queryAll({ campaign_id: beeswaxCampaignId, active: true })
            .then(response => Promise.all(response.payload.map(lineItem => (
                beeswax.lineItems.edit(lineItem.line_item_id, { active: false }).then(response => (
                    log.trace(`Deactivated lineItem(${response.payload.line_item_id})`)
                ))
            ))))
            .then(() => beeswax.campaigns.edit(beeswaxCampaignId, { active: false }))
            .then(response => (
                log.trace(`Deactivated beeswaxCampaign(${response.payload.campaign_id})`)
            ))
            .then(() => log.info(
                'Cleaned up beeswax items for ' +
                `campaign(${campaign.id})/beeswax(${beeswaxCampaignId})`
            ))
            .catch(reason => {
                throw new Error(
                    'Couldn\'t clean up beeswax entities for ' +
                    `campaign(${campaign.id}): ${inspect(reason)}`
                );
            });
    });
};
