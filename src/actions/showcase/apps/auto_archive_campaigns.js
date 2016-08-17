'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../../../lib/CwrxRequest');
const logger = require('cwrx/lib/logger');
const resolveURL = require('url').resolve;
const spread = require('lodash/spread');
const inspect = require('util').inspect;
const _ = require('lodash');
const Status = require('cwrx/lib/enums').Status;
const moment = require('moment');

module.exports = config => {
    const watchmanStream = new JsonProducer(
        config.kinesis.producer.stream,
        config.kinesis.producer
    );
    const request = new CwrxRequest(config.appCreds);
    const log = logger.getLog();

    const paymentPlansEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.paymentPlans.endpoint
    );
    const campaignsEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.campaigns.endpoint
    );

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const currentPaymentPlanId = data.currentPaymentPlanId;
        const previousPaymentPlanId = data.previousPaymentPlanId;
        const org = data.org;
        const now = moment(data.date);

        log.info(
            'Checking to see if org(%1) has downgraded their payment plan.',
            org.id
        );

        log.trace(
            'org(%1): current plan: %2; previous plan: %3.',
            org.id, currentPaymentPlanId, previousPaymentPlanId
        );

        if (!previousPaymentPlanId) {
            log.info(
                'org(%1) has no previous payment plan. Doing nothing.',
                org.id
            );

            return;
        }

        return Promise.all([
            request.get({
                url: `${paymentPlansEndpoint}/${currentPaymentPlanId}`
            }).spread(plan => plan),
            request.get({
                url: `${paymentPlansEndpoint}/${previousPaymentPlanId}`
            }).spread(plan => plan)
        ]).then(spread((currentPlan, previousPlan) => {
            if (currentPlan.price > previousPlan.price) {
                log.info(
                    'org(%1) has upgraded their subscription. Doing nothing.',
                    org.id
                );

                return undefined;
            }

            log.info(
                'org(%1) has downgraded their subscription.',
                org.id
            );

            return request.get({
                url: campaignsEndpoint,
                qs: {
                    org: org.id,
                    statuses: _(Status).values().without(Status.Canceled, Status.Deleted).join(','),
                    sort: 'created,1',
                    application: 'showcase'
                }
            }).spread(campaigns => {
                const maxCampaigns = currentPlan.maxCampaigns;
                const totalCampaigns = campaigns.length;
                const excessCampaigns = totalCampaigns - maxCampaigns;

                log.trace(
                    'org(%1) has %2 campaigns. It\'s new paymentPlan(%3) allows (%4) campaigns.',
                    org.id, totalCampaigns, currentPlan.id, maxCampaigns
                );

                if (excessCampaigns <= 0) {
                    log.info(
                        'org(%1) has no excess campaigns. Done.',
                        org.id
                    );

                    return undefined;
                }

                const campaignsToArchive = campaigns.slice(0, excessCampaigns);

                log.info(
                    'Archiving org(%1)\'s campaigns([%2]).',
                    org.id, campaignsToArchive.map(campaign => `"${campaign.id}"`).join(',')
                );

                return Promise.all(campaignsToArchive.map(campaign => (
                    request.put({
                        url: `${campaignsEndpoint}/${campaign.id}`,
                        json: {
                            status: Status.Canceled
                        }
                    }).spread(campaign => campaign)
                )))
                .then(campaigns => watchmanStream.produce({
                    type: 'archivedShowcaseCampaigns',
                    data: {
                        org,
                        campaigns,
                        currentPaymentPlan: currentPlan,
                        previousPaymentPlan: previousPlan,
                        date: now.format()
                    }
                }))
                .then(() => log.info(
                    'Archived %1 of org(%2)\'s campaigns.',
                    campaignsToArchive.length, org.id
                ));
            });
        }))
        .catch(reason => log.error(
            'Unexpected error checking if org(%1)\'s payment plan was downgraded: %2',
            org.id, inspect(reason)
        ));
    }).then(() => undefined);
};
