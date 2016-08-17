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
    const paymentMethodsEndpoint = `${resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.payments.endpoint
    )}methods`;

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
                log.info('org(%1)\'s payment plan has already been activated.', org.id);

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
                        // If the user has no free trial, don't set their nextPaymentDate to today.
                        // A record will be produced to charge their payment plan immediately, so
                        // not setting the nextPaymentDate ensures they aren't double-charged by the
                        // daily-payment-plan-charging job.
                        nextPaymentDate: trialLength > 0 ? startDate : null
                    })
                }).spread(() => {
                    log.info('Set org(%1)\'s paymentPlanStart to %2', org.id, startDate);

                    return request.get({
                        url: `${paymentPlansEndpoint}/${paymentPlanId}`
                    }).spread(paymentPlan => {
                        if (trialLength < 1) {
                            log.info(
                                'org(%1) has no free trial. Charging their payment method.',
                                org.id
                            );

                            return request.get({
                                url: paymentMethodsEndpoint,
                                qs: { org: org.id }
                            })
                            .spread(paymentMethods => {
                                const paymentMethod = ld.find(paymentMethods, { default: true });

                                if (!paymentMethod) {
                                    log.error('org(%1) has no default payment method.', org.id);

                                    return undefined;
                                }

                                return watchmanStream.produce({
                                    type: 'paymentRequired',
                                    data: {
                                        org,
                                        paymentPlan,
                                        paymentMethod,
                                        date: now.format()
                                    }
                                })
                                .then(() => log.trace(
                                    'Produced "paymentRequired" for org(%1)',
                                    org.id
                                ))
                                .catch(reason => log.error(
                                    'Failed to produce "paymentRequired" for org(%1): %2',
                                    org.id, inspect(reason)
                                ));
                            });
                        } else {
                            log.info(
                                'org(%1) has a free trial. Fulfilling their promotions.',
                                org.id
                            );

                            return Promise.all(freeTrials.map(promotion => (
                                watchmanStream.produce({
                                    type: 'promotionFulfilled',
                                    data: {
                                        org,
                                        promotion,
                                        paymentPlan,
                                        target: options.target,
                                        date: now.format()
                                    }
                                })
                                .then(() => log.trace(
                                    'Produced "promotionFulfilled" for org(%1)',
                                    org.id
                                ))
                                .catch(reason => log.error(
                                    'Failed to fulfill promotion %1: %2',
                                    promotion.id, inspect(reason)
                                ))
                            )));
                        }
                    });
                });
            });
        });
    }).then(() => undefined);
};
