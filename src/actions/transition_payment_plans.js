'use strict';

const CwrxRequest = require('../../lib/CwrxRequest');
const url = require('url');
const ld = require('lodash');
const logger = require('cwrx/lib/logger');
const moment = require('moment');

module.exports = function factory(config) {
    const request = new CwrxRequest(config.appCreds);
    const log = logger.getLog();

    return event => {
        const data = event.data;
        const orgsEndpoint = url.resolve(config.cwrx.api.root, config.cwrx.api.orgs.endpoint);

        // Reject if there is not an org in data
        if (!data.org) {
            return Promise.reject(new Error('data must contain an org'));
        }

        // Get the current payment plan for the org
        return request.get({
            url: `${orgsEndpoint}/${data.org.id}/payment-plan`
        }).then(ld.spread(body => {
            // If there is no payment plan to transition to
            if (!body.nextPaymentPlanId) {
                log.trace(`Org ${data.org.id} has no next payment plan to transition to`);
                return;
            }

            // If there is no effective date for the next payment plan
            if (!body.effectiveDate) {
                log.error(`No effective date for next payment plan ${body.nextPaymentPlanId}` +
                    ` for org ${data.org.id}`);
                return;
            }

            // If the effective date is in the future
            if (moment(body.effectiveDate).isAfter(moment(data.date))) {
                log.trace(`Org ${data.org.id} effective date ${body.effectiveDate} is after` +
                    ` ${data.date}`);
                return;
            }

            // Transition the payment plans
            log.info(`Org ${data.org.id} payment plan transitioning ${body.paymentPlanId}` +
                ` ~> ${body.nextPaymentPlanId}`);
            return request.put({
                url: `${orgsEndpoint}/${data.org.id}`,
                json: {
                    paymentPlanId: body.nextPaymentPlanId,
                    nextPaymentPlanId: null
                }
            });
        }));
    };
};
