'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const ld = require('lodash');
const moment = require('moment');
const q = require('q');
const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;

module.exports = function factory(config) {
    const log = logger.getLog();
    const watchmanStream = new JsonProducer(
        config.kinesis.producer.stream,
        config.kinesis.producer
    );
    const request = new CwrxRequest(config.appCreds);
    const orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
    const promotionsEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.promotions.endpoint
    );
    const paymentPlansEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.paymentPlans.endpoint
    );

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const options = event.options;
        const campaign = data.campaign;
        const now = moment(data.date);
        const today = moment(now).utcOffset(0).startOf('day');
        const orgEndpoint = orgsEndpoint + '/' + campaign.org;

        return request.get({ url: orgEndpoint }).spread(org => {
            const promotionIds = ld.map(org.promotions, 'id');
            const paymentPlanId = org.paymentPlanId;

            const getTrialLength = promotion => ld.get(
                promotion, `data[${paymentPlanId}].trialLength`
            );


            if (org.paymentPlanStart || !paymentPlanId) {
                return undefined;
            }

            return (
                promotionIds.length > 0 ?
                    request.get({ url: promotionsEndpoint, qs: { ids: promotionIds.join(',') } }) :
                    q([])
            ).spread(promotions => {
                const freeTrials = ld.filter(promotions, promotion => (
                    promotion.type === 'freeTrial' && !!getTrialLength(promotion)
                ));
                const trialLength = ld.sum(freeTrials.map(getTrialLength));
                const startDate = moment(today).add(trialLength, 'days').format();

                return request.put({
                    url: orgEndpoint,
                    json: ld.merge({}, org, {
                        paymentPlanStart: startDate,
                        nextPaymentDate: startDate
                    })
                }).spread(() => {
                    if (freeTrials.length < 1) {
                        return undefined;
                    }

                    return request.get({
                        url: `${paymentPlansEndpoint}/${paymentPlanId}`
                    }).spread(paymentPlan => Promise.all(freeTrials.map(promotion => (
                        watchmanStream.produce({
                            type: 'promotionFulfilled',
                            data: {
                                org,
                                promotion,
                                paymentPlan,
                                target: options.target,
                                date: now.format()
                            }
                        }).catch(reason => log.error(
                            'Failed to fulfill promotion %1: %2',
                            promotion.id, inspect(reason)
                        ))
                    ))));
                });
            });
        });
    }).then(() => undefined);
};
