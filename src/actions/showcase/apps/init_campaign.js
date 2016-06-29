/* jshint camelcase: false */
'use strict';

var BeeswaxClient   = require('beeswax-client');
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
var ld = require('lodash');

var createInterstitialFactory = appFactories.createInterstitialFactory;

module.exports = function initCampaignFactory(config) {
    var log = logger.getLog();
    var request = new CwrxRequest(config.appCreds);
    var stream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    var advertisersEndpoint = resolveURL(
            config.cwrx.api.root, config.cwrx.api.advertisers.endpoint);
    var campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);
    var placementsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.placements.endpoint);
    var beeswax = new BeeswaxClient({
        apiRoot: config.beeswax.api.root,
        creds: config.beeswax.creds
    });

    return function initCampaign(event) {
        var data = event.data;
        var options = event.options;
        var campaign = data.campaign;
        var campaignAdvertiser;

        var createInterstitial = createInterstitialFactory(
            options.card.interstitial
        );

        function setupCard(card) {
            return assign(card, {
                user: campaign.user,
                org: campaign.org
            });
        }

        log.trace('Creating external campaign for showcase (app) campaign(%1).', campaign.id);
        return request.get({
            url : advertisersEndpoint + '/' + campaign.advertiserId 
        }).spread(function ensureBeeswaxAdvertiser(advertiser){
            // The advertiser record has a Beeswax Id
            if (ld.get(advertiser, 'externalIds.beeswax', undefined) !== undefined){
                campaignAdvertiser = advertiser;
                return campaignAdvertiser;
            }

            return (function() {
                // The advertiser record has a Beeswax Id in the wrong place
                if (ld.get(advertiser, 'beeswaxIds.advertiser', undefined) !== undefined){
                    return q([advertiser, advertiser.beeswaxIds.advertiser]);
                }

                // The advertiser record does not have a Beeswax Equivalent, lets create one.
                return beeswax.advertisers.create({
                    advertiser_name : advertiser.name,
                    alternative_id : advertiser.id,
                    notes : 'Created by Showcase Apps Init Campaign.',
                    active : true
                }).then(function(result){
                    return [advertiser, result.payload.advertiser_id ];
                });
            }()).spread(function updateAdvertiser(advertiser, beeswaxId){
                // The advertiser record needs to be updated with the correct externalIds
                // property
                log.trace('Updating Campaign %1 Advertiser %2 with exteranIds.beeswax=%3',
                    campaign.id, advertiser.id, beeswaxId);
                return request.put({
                    url : advertisersEndpoint + '/' + advertiser.id,
                    json : {
                        externalIds : {
                            beeswax : beeswaxId
                        }
                    }
                }).spread(function(advertiser){
                    campaignAdvertiser = advertiser;
                    return campaignAdvertiser;
                });
            });
        }).spread(function createCards() {
            var interstitial = setupCard(createInterstitial(campaign.product));

//            log.trace(
//                'Created externalCampaign(%1) for showcase (app) campaign(%2).',
//                externalCampaign.externalId, campaign.id
//            );

            log.trace('Creating cards for showcase (app) campaign(%1)', campaign.id);
            return request.put({
                url: campaignsEndpoint + '/' + campaign.id,
                json: assign({}, campaign, {
                    cards: campaign.cards.concat([
                        interstitial
                    ])
                })
            });
        }).spread(function createPlacements(campaign) {
            var newCards = takeRight(campaign.cards, 1);
            var interstitial = newCards[0];

            function tagParams(options) {
                return mapValues(options.tagParams, 'value');
            }

            function showInTag(options) {
                return mapValues(pickBy(options.tagParams, { inTag: true }), 'inTag');
            }

            log.trace(
                'Created cards([%1]) for showcase (app) campaign(%3).',
                interstitial.id, campaign.id
            );

            log.trace(
                'Creating placements for cards([%1]).',
                interstitial.id
            );

            return q.all([
                {
                    label: 'Showcase--Interstitial for App: "' + campaign.name + '"',
                    tagType: options.placement.interstitial.tagType,
                    tagParams: assign({}, tagParams(options.placement.interstitial), {
                        card: interstitial.id
                    }),
                    showInTag: showInTag(options.placement.interstitial),
                    thumbnail: interstitial.thumbs.small
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
                    'Created placements for cards([%1 => %2]).',
                    newCards[0].id, placements[0].id
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
/* jshint camelcase: true */
