'use strict';

var CwrxRequest = require('../../../../lib/CwrxRequest');
var JsonProducer = require('rc-kinesis').JsonProducer;
var logger = require('cwrx/lib/logger');
var resolveURL = require('url').resolve;
var inspect = require('util').inspect;
var appFactories = require('showcase-core').factories.app;
var assign = require('lodash').assign;
var takeRight = require('lodash').takeRight;
var unzip = require('lodash').unzip;
var mapValues = require('lodash').mapValues;
var pickBy = require('lodash').pickBy;
var q = require('q');

var createInterstitialFactory = appFactories.createInterstitialFactory;
var createThreeHundredByTwoFiftyFactory = appFactories.createThreeHundredByTwoFiftyFactory;

module.exports = function initCampaignFactory(config) {
    var log = logger.getLog();
    var request = new CwrxRequest(config.appCreds);
    var stream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);
    var placementsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.placements.endpoint);

    return function initCampaign(event) {
        var data = event.data;
        var options = event.options;
        var campaign = data.campaign;

        var createInterstitial = createInterstitialFactory(
            options.card.interstitial
        );
        var createThreeHundredByTwoFifty = createThreeHundredByTwoFiftyFactory(
            options.card.threeHundredByTwoFifty
        );

        log.trace('Creating external campaign for showcase (app) campaign(%1).', campaign.id);
        return request.post({
            url: campaignsEndpoint + '/' + campaign.id + '/external/beeswax',
            json: {}
        }).spread(function createCards(externalCampaign) {
            var interstitial = createInterstitial(campaign.product);
            var threeHundredByTwoFifty = createThreeHundredByTwoFifty(campaign.product);

            log.trace(
                'Created externalCampaign(%1) for showcase (app) campaign(%2).',
                externalCampaign.externalId, campaign.id
            );

            log.trace('Creating cards for showcase (app) campaign(%1)', campaign.id);
            return request.put({
                url: campaignsEndpoint + '/' + campaign.id,
                json: assign({}, campaign, {
                    cards: campaign.cards.concat([
                        interstitial,
                        threeHundredByTwoFifty
                    ])
                })
            });
        }).spread(function createPlacements(campaign) {
            var newCards = takeRight(campaign.cards, 2);
            var interstitial = newCards[0];
            var threeHundredByTwoFifty = newCards[1];

            function tagParams(options) {
                return mapValues(options.tagParams, 'value');
            }

            function showInTag(options) {
                return mapValues(pickBy(options.tagParams, { inTag: true }), 'inTag');
            }

            log.trace(
                'Created cards([%1, %2]) for showcase (app) campaign(%3).',
                interstitial.id, threeHundredByTwoFifty.id, campaign.id
            );

            log.trace(
                'Creating placements for cards([%1, %2]).',
                interstitial.id, threeHundredByTwoFifty.id
            );

            return q.all([
                {
                    label: 'Showcase--Interstitial for App: "' + campaign.name + '"',
                    tagType: options.placement.interstitial.tagType,
                    tagParams: assign({}, tagParams(options.placement.interstitial), {
                        card: interstitial.id
                    }),
                    showInTag: showInTag(options.placement.interstitial)
                },
                {
                    label: 'Showcase--300x250 for App: "' + campaign.name + '"',
                    tagType: options.placement.threeHundredByTwoFifty.tagType,
                    tagParams: assign({}, tagParams(options.placement.threeHundredByTwoFifty), {
                        card: threeHundredByTwoFifty.id
                    }),
                    showInTag: showInTag(options.placement.threeHundredByTwoFifty)
                }
            ].map(function(json) {
                return request.post({
                    url: placementsEndpoint,
                    json: assign({}, json, {
                        tagParams: assign({}, json.tagParams, {
                            campaign: campaign.id
                        })
                    })
                });
            })).then(unzip).spread(function produceRecord(placements) {
                log.trace(
                    'Created placements for cards([%1 => %2, %3 => %4]).',
                    newCards[0].id, placements[0].id, newCards[1].id, placements[1].id
                );

                log.trace(
                    'Producing "initializedShowcaseCampaign" for showcase (app) campaign(%1).',
                    campaign.id
                );

                return stream.produce({
                    type: 'initializedShowcaseCampaign',
                    data: {
                        campaign: campaign,
                        placements: placements,
                        date: data.date
                    }
                });
            });
        }).tap(function logSuccess() {
            return log.info('Successfully initialized showcase (app) campaign(%1).', campaign.id);
        }).catch(function logError(reason) {
            return log.error(
                'Failed to initialize showcase (app) campaign(%1): %2',
                campaign.id, inspect(reason)
            );
        }).thenResolve(undefined);
    };
};
