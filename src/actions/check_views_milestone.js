'use strict';

const CwrxRequest = require('../../lib/CwrxRequest.js');
const enums = require('cwrx/lib/enums.js');
const ld = require('lodash');
const logger = require('cwrx/lib/logger.js');
const rcKinesis = require('rc-kinesis');
const url = require('url');

module.exports = function factory(config) {
    const apiRoot = config.cwrx.api.root;
    const analyticsEndpoint = url.resolve(apiRoot,
        `${config.cwrx.api.analytics.endpoint}/campaigns/showcase/apps`);
    const campaignsEndpoint = url.resolve(apiRoot, config.cwrx.api.campaigns.endpoint);
    const cwrxRequest = new CwrxRequest(config.appCreds);
    const log = logger.getLog();
    const producerConfig = config.kinesis.producer;
    const producer = new rcKinesis.JsonProducer(producerConfig.stream, producerConfig);
    const releventStatuses = ld.values(enums.Status)
        .filter(value => value !== enums.Status.Canceled && value !== enums.Status.Deleted);

    return event => {
        const data = event.data;
        const options = event.options;
        const org = data.org;
        const milestones = options.milestones;

        if (milestones && milestones.length > 0) {
            // Get relevent campaigns for the given org
            return cwrxRequest.get({
                url: campaignsEndpoint,
                qs: {
                    application: 'showcase',
                    org: org.id,
                    statuses: releventStatuses.join(','),
                    sort: 'created,1',
                    limit: '1'
                }
            }).then(response => {
                const body = response[0];
                const campaign = body.length === 0 ? null : body[0];

                // If the org has a relevent showcase campaign
                if (campaign) {
                    // Get analytics for the campaign
                    return cwrxRequest.get(`${analyticsEndpoint}/${campaign.id}`).then(response => {
                        const analytics = response[0];
                        const views = analytics.summary.users;
                        const sorted = milestones.concat(views).sort();
                        const index = sorted.lastIndexOf(views);

                        // If the campaign has not reached a views milestone
                        if (index === 0) {
                            log.info(`campaign ${campaign.id} from org ${org.id} with ` +
                                `${views} views is not yet at the first views milestone`);
                        } else {
                            const milestone = sorted[index - 1];

                            log.info(`campaign ${campaign.id} from org ${org.id} with ` +
                                `${views} views is at the ${milestone} views milestone`);

                            // Produce the views milestone event
                            return producer.produce({
                                type: 'views_milestone',
                                data: {
                                    org: org,
                                    campaign: campaign,
                                    analytics: analytics,
                                    milestone: milestone
                                }
                            });
                        }
                    });
                } else {
                    log.trace(`org ${org.id} has no relevent showcase campaigns`);
                }
            });
        } else {
            log.warn(`no milestones given so not checking org ${org.id}`);
            return Promise.resolve();
        }
    };
};
