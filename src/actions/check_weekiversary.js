'use strict';

const CwrxRequest = require('../../lib/CwrxRequest.js');
const JsonProducer = require('rc-kinesis').JsonProducer;
const enums = require('cwrx/lib/enums.js');
const ld = require('lodash');
const logger = require('cwrx/lib/logger.js');
const moment = require('moment');
const url = require('url');

module.exports = function factory(config) {

    const log = logger.getLog();
    const producerConfig = config.kinesis.producer;
    const producer = new JsonProducer(producerConfig.stream, producerConfig);
    const request = new CwrxRequest(config.appCreds);
    const campaignsEndpoint = url.resolve(config.cwrx.api.root,
        config.cwrx.api.campaigns.endpoint);
    const usersEndpoint = url.resolve(config.cwrx.api.root, config.cwrx.api.users.endpoint);
    const transactionsEndpoint = url.resolve(config.cwrx.api.root,
        config.cwrx.api.transactions.endpoint);
    const releventStatuses = ld.values(enums.Status)
        .filter(value => value !== enums.Status.Canceled && value !== enums.Status.Deleted);

    const getCampaigns = org => {
        return request.get({
            url: campaignsEndpoint,
            qs: {
                application: 'showcase',
                org: org.id,
                statuses: releventStatuses.join(','),
                sort: 'created,1',
                limit: '1'
            }
        }).then(results => results[0]);
    };

    const hasCurrentPayment = org => {
        return request.get({
            url: `${transactionsEndpoint}/showcase/current-payment`,
            qs: {
                org: org.id
            }
        }).then(() => true).catch(error => {
            if (error.statusCode === 404) {
                return false;
            }
            throw error;
        });
    };

    return event => {
        const data = event.data;

        if(data.org && data.date) {
            return Promise.all([
                getCampaigns(data.org),
                hasCurrentPayment(data.org)
            ]).then(results => {
                const campaigns = results[0];
                const hasPayment = results[1];

                if(campaigns.length > 0 && hasPayment) {
                    const firstCampaign = campaigns[0];
                    const now = moment(new Date(data.date));
                    const campaignCreated = moment(new Date(firstCampaign.created));
                    const daysSinceFirstCampaign = now.diff(campaignCreated, 'days');
                    const isWeekavirsary = daysSinceFirstCampaign > 0 &&
                        daysSinceFirstCampaign % 7 === 0;

                    log.trace(`Campaign ${firstCampaign.id} from org ${data.org.id} is ` +
                        `${daysSinceFirstCampaign} days old`);

                    if(isWeekavirsary) {
                        return request.get({
                            url: usersEndpoint,
                            qs: {
                                org: data.org.id
                            }
                        }).then(results => {
                            const users = results[0];

                            return Promise.all(users.map(user => {
                                return producer.produce({
                                    type: 'campaign_weekiversary',
                                    data: {
                                        campaign: firstCampaign,
                                        user: user,
                                        week: daysSinceFirstCampaign / 7
                                    }
                                });
                            }));
                        });
                    }
                }
            });
        } else {
            return Promise.reject('Must pass an org and date in data');
        }
    };
};
