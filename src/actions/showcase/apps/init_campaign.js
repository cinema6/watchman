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
var getVal = require('lodash').get;
var q = require('q');

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

        var createInterstitial = createInterstitialFactory(
            options.card.interstitial
        );

        function setupCard(card) {
            return assign(card, {
                user: campaign.user,
                org: campaign.org
            });
        }

        log.trace('Looking up Advertiser (%1) for showcase (app) campaign(%2).',
                campaign.advertiserId, campaign.id);

        return request.get({
            url : advertisersEndpoint + '/' + campaign.advertiserId 
        }).spread(function ensureBeeswaxAdvertiser(advertiser){
            // The advertiser record has an externaIds hash with a Beeswax Id
            if (getVal(advertiser, 'externalIds.beeswax', undefined) !== undefined){
                log.trace('Advertiser (%1) has BeeswaxId (%2)',
                    advertiser.id,advertiser.externalIds.beeswax);
                return [advertiser];
            }

            return (function() {
                // The advertiser record has a Beeswax Id in the wrong place
                if (getVal(advertiser, 'beeswaxIds.advertiser', undefined) !== undefined){
                    return q([advertiser, advertiser.beeswaxIds.advertiser]);
                }

                log.info('Creating beeswax Advertiser for advertiser (%1).',
                    advertiser.id);
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
                });
            });
        }).spread(function createBeeswaxCampaign(advertiser) {
            log.info('Initialize beeswax campaign for campaign (%1)',campaign.id);
            return beeswax.campaigns.create({
                advertiser_id: advertiser.externalIds.beeswax,
                alternative_id : campaign.id,
                campaign_name: campaign.name,
                start_date: (new Date()).toISOString().substr(0,10) + ' 00:00:00',
                active: false
            }).then(function(result){
                return result.payload;
            });
        }).then(function createCards(externalCampaign) {
            log.trace('Updating campaign for %1 with cards and externalIds beeswax:%2',
                campaign.id, externalCampaign.campaign_id);
            var interstitial = setupCard(createInterstitial(campaign.product));

            return request.put({
                url: campaignsEndpoint + '/' + campaign.id,
                json: assign({}, campaign, {
                    cards: campaign.cards.concat([
                        interstitial
                    ]),
                    externalIds : {
                        beeswax : externalCampaign.campaign_id
                    }
                })
            });
        }).spread(function createPlacements(campaign) {
            log.trace('campaignCards:',campaign.cards);
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
