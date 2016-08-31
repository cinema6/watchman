'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const ld = require('lodash');
const moment = require('moment');
const logger = require('cwrx/lib/logger');

module.exports = function factory(config) {
    const watchmanStream = new JsonProducer(
        config.kinesis.producer.stream,
        config.kinesis.producer
    );
    const request = new CwrxRequest(config.appCreds);
    const paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);
    const paymentMethodsEndpoints = resolveURL(paymentsEndpoint, 'methods');
    const paymentPlansEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.paymentPlans.endpoint
    );
    const log = logger.getLog();

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const org = data.org;
        const now = moment(data.date);
        const nextPaymentDate = org.nextPaymentDate && moment(org.nextPaymentDate);

        if (!nextPaymentDate || nextPaymentDate.isAfter(now)) {
            return undefined;
        }

        if (org.nextPaymentPlanId) {
            log.warn(`Org ${org.id} has pending next payment plan ${org.nextPaymentPlanId}` +
                ' which should have been transitioned');
            return undefined;
        }

        return Promise.all([
            request.get({ url: paymentMethodsEndpoints, qs: { org: org.id } }),
            request.get({ url: `${paymentPlansEndpoint}/${org.paymentPlanId}` })
        ]).then(ld.unzip).then(ld.spread(ld.spread((paymentMethods, paymentPlan) => {
            const paymentMethod = ld.find(paymentMethods, { default: true });

            if (!paymentMethod) {
                log.info(
                    'org(%1) has no payment method.',
                    org.id
                );

                return undefined;
            }

            if (!paymentPlan.price) {
                log.info(
                    'org(%1) has paymentPlan(%2) whice has a price of $%3. Doing nothing.',
                    org.id, paymentPlan.id, paymentPlan.price
                );

                return undefined;
            }

            log.info(
                'Producing "paymentRequired" for org(%1).',
                org.id
            );

            return watchmanStream.produce({
                type: 'paymentRequired',
                data: {
                    org,
                    paymentPlan,
                    paymentMethod,
                    date: data.date
                }
            });
        })));
    });
};
