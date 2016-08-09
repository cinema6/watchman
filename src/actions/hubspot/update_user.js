'use strict';

const CwrxRequest = require('../../../lib/CwrxRequest.js');
const Hubspot = require('../../../lib/Hubspot.js');
const handlebars = require('handlebars');
const ld = require('lodash');
const logger = require('cwrx/lib/logger.js');
const url = require('url');
const util = require('util');

module.exports = function factory(config) {
    const hubspot = new Hubspot(config.state.secrets.hubspot.key);
    const log = logger.getLog();
    const request = new CwrxRequest(config.appCreds);
    const usersEndpoint = url.resolve(config.cwrx.api.root, config.cwrx.api.users.endpoint);
    const paymentPlansEndpoint = url.resolve(config.cwrx.api.root,
        config.cwrx.api.paymentPlans.endpoint);

    return event => {
        const data = event.data;
        const options = event.options;

        const getUser = () => {
            if (data.user) {
                return Promise.resolve(data.user);
            } else if (data.campaign) {
                log.trace(`Fetching user ${data.campaign.user} from campaign ${data.campaign.id}`);
                return request.get({
                    url: `${usersEndpoint}/${data.campaign.user}`
                }).then(users => users[0]);
            } else if (data.org) {
                return request.get({
                    url: usersEndpoint,
                    qs: {
                        org: data.org.id,
                        sort: 'created,1'
                    }
                }).then(result => result[0][0]);
            } else {
                return Promise.reject('Data must contain a user or a campaign');
            }
        };

        const getPaymentPlan = () => {
            const paymentPlan = data.currentPaymentPlanId;

            if (paymentPlan) {
                return request.get({
                    url: `${paymentPlansEndpoint}/${paymentPlan}`
                }).then(result => result[0]);
            }

            return Promise.resolve();
        };

        const mapProperties = properties => {
            return {
                properties: ld.map(properties, (value, key) => ({
                    property: key,
                    value: handlebars.compile(value)(data)
                }))
            };
        };

        return Promise.all([
            getUser(),
            getPaymentPlan()
        ]).then(results => {
            const user = results[0];
            const paymentPlan = results[1];

            log.info(`Updating user ${user.id} in Hubspot`);

            return hubspot.getContactByEmail(data.oldEmail || user.email).then(contact => {
                const properties = ld.assignIn({
                    email: user.email,
                    firstname: user.firstName,
                    lastname: user.lastName
                }, options.properties || { });

                if (paymentPlan) {
                    properties.payment_plan = paymentPlan.label;
                }

                const hubspotFormattedProperties = mapProperties(properties);

                return contact ?
                    hubspot.updateContact(contact.vid, hubspotFormattedProperties) :
                    hubspot.createContact(hubspotFormattedProperties);
            });
        }).catch(error =>
            log.error(`An error occurred updating a user in Hubspot: ${util.inspect(error)}`)
        );
    };
};
