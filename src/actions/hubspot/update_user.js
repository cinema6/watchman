'use strict';

const CwrxRequest = require('../../../lib/CwrxRequest.js');
const Hubspot = require('../../../lib/Hubspot.js');
const Q = require('q');
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

    return function action(event) {
        const data = event.data;
        const options = event.options;

        function getUser() {
            if(data.user) {
                return Q.resolve(data.user);
            } else if(data.campaign) {
                log.trace('Fetching user %1 from campaign %2', data.campaign.user,
                    data.campaign.id);
                return request.get({
                    url: usersEndpoint + '/' + data.campaign.user
                }).then(function(users) {
                    return users[0];
                });
            } else {
                return Q.reject('Data must contain a user or a campaign');
            }
        }

        function mapProperties(properties) {
            return {
                properties: ld.map(properties, function(value, key) {
                    return {
                        property: key,
                        value: handlebars.compile(value)(data)
                    };
                })
            };
        }

        return getUser().then(function(user) {
            log.info('Updating user %1 in Hubspot', user.id);
            return hubspot.getContactByEmail(data.oldEmail || user.email).then(function(contact) {
                const properties = ld.assignIn({
                    email: user.email,
                    firstname: user.firstName,
                    lastname: user.lastName
                }, options.properties || { });
                const hubspotFormattedProperties = mapProperties(properties);

                return contact ?
                    hubspot.updateContact(contact.vid, hubspotFormattedProperties) :
                    hubspot.createContact(hubspotFormattedProperties);
            });
        }).catch(function(error) {
            log.error('An error occurred updating a user in Hubspot: %1', util.inspect(error));
        });
    };
};
