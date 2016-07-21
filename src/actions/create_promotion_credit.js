'use strict';

const util = require('util');
const ld = require('lodash');
const logger = require('cwrx/lib/logger.js');
const requestUtils = require('cwrx/lib/requestUtils.js');
const moment = require('moment');

module.exports = function(config) {
    return event => Promise.resolve().then(() => {
        const log = logger.getLog();
        const appCreds = config.appCreds;
        const org = event.data.org;
        const promotion = event.data.promotion;
        const paymentPlan = event.data.paymentPlan;
        const target = event.data.target;
        const now = moment(event.data.date);
        const today = moment(now).utcOffset(0).startOf('day');

        function getTransactionData(promotion) {
            switch (promotion.type) {
            case 'signupReward':
                return { amount: promotion.data.rewardAmount };
            case 'freeTrial': {
                const trial = promotion.data[paymentPlan.id];

                if (!trial) {
                    return null;
                }

                const trialLength = trial.trialLength;
                const targetUsers = trial.targetUsers;
                const price = paymentPlan.price;

                return {
                    // Calculate the amount of credit by prorating the monthly price across each day
                    // of the trial (assuming a month is 30 days.)
                    targetUsers,
                    amount: ld.round(price * (targetUsers / paymentPlan.viewsPerMonth), 2),
                    paymentPlanId: trialLength ? paymentPlan.id : null,
                    cycleStart: trialLength ? today.format() : null,
                    cycleEnd: trialLength ?
                        moment(today).add(trialLength, 'days').endOf('day').format() :
                        null
                };
            }
            default:
                return null;
            }
        }

        if (!org || !promotion) {
            return undefined;
        }

        const transactionData = getTransactionData(promotion);

        if (!transactionData) {
            log.warn(
                'Dont know how to get amount for promotion type %1 (id %2)',
                promotion.type, promotion.id
            );
            return undefined;
        }

        return requestUtils.makeSignedRequest(appCreds, 'post', {
            url: config.cwrx.api.root + config.cwrx.api.transactions.endpoint,
            json: ld.assign({}, {
                org: org.id,
                promotion: promotion.id,
                application: target
            }, transactionData)
        }).then(resp => {
            if (resp.response.statusCode !== 201) {
                const error = new Error('Error creating transaction');

                error.reason = { code: resp.response.statusCode, body: resp.body };

                throw error;
            }

            log.info(
                'Created transaction %1 (amount = %2) for promotion %3 for org %4',
                resp.body.id, resp.body.amount, promotion.id, org.id
            );
        }).catch(error => log.error(
            'Error creating credit for promotion %1 for org %2: %3',
            promotion.id, org.id, util.inspect(error)
        ));
    });
};
