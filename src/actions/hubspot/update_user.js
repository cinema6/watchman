var CwrxRequest = require('../../../lib/CwrxRequest.js');
var Hubspot = require('../../../lib/Hubspot.js');
var Q = require('q');
var ld = require('lodash');
var logger = require('cwrx/lib/logger.js');
var url = require('url');
var util = require('util');

module.exports = function factory(config) {
    'use strict';

    var hubspot = new Hubspot(config.state.secrets.hubspot.key);
    var log = logger.getLog();
    var request = new CwrxRequest(config.appCreds);
    var usersEndpoint = url.resolve(config.cwrx.api.root, config.cwrx.api.users.endpoint);

    return function action(event) {
        var data = event.data;
        var options = event.options;

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
                        value: value
                    };
                })
            };
        }

        return getUser().then(function(user) {
            log.info('Updating user %1 in Hubspot', user.id);
            return hubspot.getContactByEmail(data.oldEmail || user.email).then(function(contact) {
                var properties = ld.assignIn({
                    email: user.email,
                    firstname: user.firstName,
                    lastname: user.lastName
                }, options.properties || { });
                var hubspotFormattedProperties = mapProperties(properties);

                return contact ?
                    hubspot.updateContact(contact.vid, hubspotFormattedProperties) :
                    hubspot.createContact(hubspotFormattedProperties);
            });
        }).catch(function(error) {
            log.error('An error occurred updating a user in Hubspot: %1', util.inspect(error));
        });
    };
};
