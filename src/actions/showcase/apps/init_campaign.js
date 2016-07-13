'use strict';

var CwrxRequest = require('../../../../lib/CwrxRequest');
var BeeswaxMiddleware = require('../../../../lib/BeeswaxMiddleware');
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

module.exports = function initCampaignFactory(config) {
    var log = logger.getLog();
    var beeswax = new BeeswaxMiddleware(
        { apiRoot: config.beeswax.apiRoot, creds : config.state.secrets.beeswax},
        { creds : config.appCreds, api : config.cwrx.api }
    );
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

        function setupCard(card) {
            return assign(card, {
                user: campaign.user,
                org: campaign.org
            });
        }

        log.trace('Creating cards for showcase (app) campaign(%1)', campaign.id);
        return request.put({
            url: campaignsEndpoint + '/' + campaign.id,
            json: assign({}, campaign, {
                cards: campaign.cards.concat([
                    setupCard(createInterstitial(campaign.product))
                ])
            })
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
                'Created card([%1) for showcase (app) campaign(%2).',
                interstitial.id, campaign.id
            );

            log.trace( 'Creating placements for card([%1]).', interstitial.id);

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
                    qs : { ext : false },
                    json: assign({}, json, {
                        tagParams: assign({}, json.tagParams, {
                            campaign: campaign.id
                        })
                    })
                });
            })).then(unzip).spread(function syncToBeeswax(placements) {
                log.trace(
                    'Created placements for card([%1 => %2]).',
                    newCards[0].id, placements[0].id
                );

                log.trace('Initializing campaign %1 in beeswax!', campaign.id);

                return beeswax.initShowcaseAppsCampaign({
                    campaign : campaign,
                    placements : placements
                });
            }).then(function produceRecord(bwResponse){
                log.trace(
                    'Producing "initializedShowcaseCampaign" for showcase (app) campaign(%1).',
                    bwResponse.campaign.id
                );

                return stream.produce({
                    type: 'initializedShowcaseCampaign',
                    data: {
                        campaign: bwResponse.campaign,
                        placements: bwResponse.placements,
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
