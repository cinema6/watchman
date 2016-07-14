'use strict';

const JsonProducer = require('rc-kinesis').JsonProducer;
const CwrxRequest = require('../../lib/CwrxRequest');
const resolveURL = require('url').resolve;
const moment = require('moment');
const logger = require('cwrx/lib/logger');
const inspect = require('util').inspect;

module.exports = function factory(config) {
    const watchmanStream = new JsonProducer(
        config.kinesis.producer.stream,
        config.kinesis.producer
    );
    const request = new CwrxRequest(config.appCreds);
    const paymentsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.payments.endpoint);
    const orgsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);
    const log = logger.getLog();

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const options = event.options;
        const now = moment(data.date);
        const today = moment(now).utcOffset(0).startOf('day');
        const org = data.org;
        const paymentMethod = data.paymentMethod;
        const paymentPlan = data.paymentPlan;

        return request.post({
            url: paymentsEndpoint,
            qs: { org: org.id, target: options.target },
            json: {
                paymentMethod: paymentMethod.token,
                amount: paymentPlan.price,
                transaction: {
                    application: options.target,
                    paymentPlanId: paymentPlan.id,
                    targetUsers: paymentPlan.viewsPerMonth,
                    cycleStart: today.format(),
                    cycleEnd: moment(today).add(1, 'month').subtract(1, 'day').endOf('day').format()
                }
            }
        }).spread(payment => (
            // TODO: Stop updating the org's nextPaymentDate
            request.put({
                url: orgsEndpoint + '/' + org.id,
                json: {
                    nextPaymentDate: moment(today).add(1, 'month').format()
                }
            }).then(() => watchmanStream.produce({
                type: 'chargedPaymentPlan',
                data: {
                    org: org,
                    paymentPlan: paymentPlan,
                    payment: payment
                }
            }), reason => log.error(
                'Failed to update org(%1)\'s nextPaymentDate: %2.',
                org.id, inspect(reason)
            ))
        )).catch(reason => {
            if (/^4/.test(reason.statusCode)) {
                return watchmanStream.produce({
                    type: 'chargePaymentPlanFailure',
                    data: {
                        org: org,
                        paymentPlan: paymentPlan,
                        paymentMethod: paymentMethod
                    }
                });
            }

            throw reason;
        });
    }).then(() => undefined);
};
