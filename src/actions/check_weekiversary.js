'use strict';

const CwrxRequest = require('../../lib/CwrxRequest.js');
const JsonProducer = require('rc-kinesis').JsonProducer;
const logger = require('cwrx/lib/logger.js');
const moment = require('moment');
const url = require('url');

module.exports = function factory(config) {

    const log = logger.getLog();
    const producerConfig = config.kinesis.producer;
    const producer = new JsonProducer(producerConfig.stream, producerConfig);
    const request = new CwrxRequest(config.appCreds);

    return event => {
        const data = event.data;
        const campaignsEndpoint = url.resolve(config.cwrx.api.root,
            config.cwrx.api.campaigns.endpoint);
        const usersEndpoint = url.resolve(config.cwrx.api.root, config.cwrx.api.users.endpoint);

        if(data.org && data.date) {
            return request.get({
                url: campaignsEndpoint,
                qs: {
                    org: data.org.id,
                    statuses: 'active',
                    sort: 'created,1',
                    limit: '1'
                }
            }).then(results => {
                const campaigns = results[0];

                if(campaigns.length > 0) {
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