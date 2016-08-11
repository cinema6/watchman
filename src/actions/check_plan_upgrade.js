'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const spread = require('lodash').spread;
const find = require('lodash').find;
const round = require('lodash').round;
const moment = require('moment');
const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;

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
    const cycleEndpoint = `${resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.transactions.endpoint
    )}/showcase/current-payment`;
    const paymentMethodsEndpoint = `${resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.payments.endpoint
    )}methods`;

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const currentPaymentPlanId = data.currentPaymentPlanId;
        const previousPaymentPlanId = data.previousPaymentPlanId;
        const org = data.org;
        const now = moment(data.date).utcOffset(0);

        log.info(
            'Checking to see if org(%1) has upgraded their payment plan.',
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
            if (currentPlan.price < previousPlan.price) {
                log.info(
                    'org(%1) has downgraded their subscription. Doing nothing.',
                    org.id
                );

                return;
            }

            log.info(
                'org(%1) has upgraded their subscription.',
                org.id
            );

            return Promise.all([
                request.get({
                    url: cycleEndpoint,
                    qs: { org: org.id }
                }).spread(cycle => cycle),
                request.get({
                    url: paymentMethodsEndpoint,
                    qs: { org: org.id }
                }).spread(methods => methods)
            ]).then(spread((cycle, paymentMethods) => {
                const cycleStart = moment(cycle.cycleStart);
                const cycleEnd = moment(cycle.cycleEnd);
                const paymentMethod = find(paymentMethods, { default: true });
                // Get the number of days in the user's current billing cycle.
                const cycleLength = cycleEnd.diff(cycleStart, 'days', true);
                // Get the number of days that remain in their current billing cycle.
                const remaining = cycleEnd.diff(now, 'days', true);
                // Calculate a discount for the next billing cycle by pro-rating the amount of
                // remaining days in the current cycle over the monthly price of that cycle.
                const discount = round((remaining / cycleLength) * cycle.amount, 2);

                if (!paymentMethod) {
                    throw new Error(`org(${org.id}) has no default payment method.`);
                }

                log.info(
                    'org(%1)\'s cycle of $%2 was %3 days. ' +
                    '%4 days remain. ' +
                    'Giving them a $%5 discount.',
                    org.id, cycle.amount, cycleLength, remaining, discount
                );

                return watchmanStream.produce({
                    type: 'paymentRequired',
                    data: {
                        org,
                        paymentMethod,
                        discount,
                        paymentPlan: currentPlan,
                        date: now.format()
                    }
                });
            }));
        })).catch(reason => log.error(
            'Unexpected error checking if org(%1)\'s payment plan was upgraded: %2',
            org.id, inspect(reason)
        ));
    }).then(() => undefined);
};
