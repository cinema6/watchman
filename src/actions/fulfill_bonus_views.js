'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const spread = require('lodash').spread;
const moment = require('moment');
const inspect = require('util').inspect;
const logger = require('cwrx/lib/logger');

module.exports = config => {
    const watchmanStream = new JsonProducer(
        config.kinesis.producer.stream,
        config.kinesis.producer
    );
    const request = new CwrxRequest(config.appCreds);
    const log = logger.getLog();

    const orgsEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.orgs.endpoint
    );
    const paymentsEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.payments.endpoint
    );
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
        const transaction = data.transaction;
        const now = moment(data.date);
        const target = options.target;
        const paymentPlanId = transaction.paymentPlanId;

        if (!paymentPlanId) {
            log.error(
                'transaction(%1) has no paymentPlanId.',
                transaction.id
            );

            return undefined;
        }

        return Promise.all([
            request.get({
                url: `${orgsEndpoint}/${transaction.org}`
            }).spread(org => org),
            request.get({
                url: paymentsEndpoint,
                qs: { org: transaction.org }
            }).spread(payments => payments)
        ]).then(spread((org, payments) => {
            if (!org.promotions || org.promotions.length < 1) {
                log.info('org(%1) has no promotions. Done.', org.id);

                return undefined;
            }

            if (payments.length > 1) {
                log.info(
                    '%1 payments have been made. Not awarding the promotions.',
                    payments.length
                );

                return undefined;
            }

            return Promise.all(org.promotions.map(promotion => (
                request.get({
                    url: `${promotionsEndpoint}/${promotion.id}`
                }).spread(promotion => promotion)
            ))).then(promotions => {
                const bonusViewPromotions = promotions.filter(promotion => (
                    promotion.type === 'freeTrial' &&
                    promotion.data[paymentPlanId] &&
                    !promotion.data[paymentPlanId].trialLength
                ));

                if (bonusViewPromotions.length < 1) {
                    log.info(
                        'org(%1) has no bonus view promotions. Done.',
                        org.id
                    );

                    return undefined;
                }

                return request.get({
                    url: `${paymentPlansEndpoint}/${paymentPlanId}`
                }).spread(paymentPlan => (
                    Promise.all(bonusViewPromotions.map(promotion => watchmanStream.produce({
                        type: 'promotionFulfilled',
                        data: {
                            org,
                            paymentPlan,
                            promotion,
                            target,
                            date: now.format()
                        }
                    })))
                    .then(() => log.info(
                        'Fulfilled %1 bonus view promotions for org(%2).',
                        bonusViewPromotions.length, org.id
                    ))
                ));
            });
        }))
        .catch(reason => log.error(
            'Failed to fulfill bonus view promotions for transaction(%1) with paymentPlan(%2): %3',
            transaction.id, transaction.paymentPlanId, inspect(reason)
        ));
    })
    .then(() => undefined);
};
