/* jshint camelcase: false */
'use strict';

var BeeswaxClient   = require('beeswax-client');
var CwrxRequest = require('../../../../lib/CwrxRequest');
var JsonProducer = require('rc-kinesis').JsonProducer;
var logger = require('cwrx/lib/logger');
var resolveURL = require('url').resolve;
var parseURL = require('url').parse;
var inspect = require('util').inspect;
var appFactories = require('showcase-core').factories.app;
var assign = require('lodash').assign;
var takeRight = require('lodash').takeRight;
var unzip = require('lodash').unzip;
var mapValues = require('lodash').mapValues;
var pickBy = require('lodash').pickBy;
var getVal = require('lodash').get;
var q = require('q');
var path = require('path');
var fs = require('fs');

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
    var appStoreToIABCats = function(asCats){
        return (asCats || []).map(function(cat){
            if (cat === 'Books')			 { return 'IAB1_1'; }   // (Books & Literature)
            if (cat === 'Business')			 { return 'IAB3_4'; }   // (Business Software)
            if (cat === 'Catalogs')			 { return 'IAB22'; }    // (Shopping)
            if (cat === 'Education')	     { return 'IAB5'; }     // (Education)
            if (cat === 'Entertainment')     { return 'IAB1'; }     // (Arts &Entertainment)
            if (cat === 'Finance')			 { return 'IAB13'; }    // (Personal Finance)
            if (cat === 'Food & Drink')	     { return 'IAB8'; }     // (Food & Drink)
            if (cat === 'Games')			 { return 'IAB9_30'; }  // (Video & Comp. Games)
            if (cat === 'Health & Fitness')  { return 'IAB7'; }     // (Health & Fitness)
            if (cat === 'Lifestyle')	     { return 'IAB9'; }     // (Hobbies  & Interests)
            if (cat === 'Medical')			 { return 'IAB7'; }     // (Health & Medicine)
            if (cat === 'Music')			 { return 'IAB1_6'; }   // (Music)
            if (cat === 'Navigation')	     { return 'IAB19'; }    // (Tech & Computing)
            if (cat === 'News')			     { return 'IAB12'; }    // (News)
            if (cat === 'Photo & Video')     { return 'IAB9_23'; }  // (Photography)
            if (cat === 'Productivity')		 { return 'IAB3_4'; }   // (Business Software)
            if (cat === 'Reference')		 { return 'IAB5'; }     // (Education)
            if (cat === 'Social Networking') { return 'IAB24'; }    // (Uncategorized)
            if (cat === 'Sports')			 { return 'IAB17'; }    // (Sports)
            if (cat === 'Travel')			 { return 'IAB20'; }    // (Travel)
            if (cat === 'Utilities')		 { return 'IAB19'; }    // (Tech & Computing)
            if (cat === 'Weather')			 { return 'IAB15_10'; } // (Science-Weather)
            return 'IAB24';     // (Uncategorized)
        });
    };

    return function initCampaign(event) {
        var data = event.data;
        var options = event.options;
        var campaign = data.campaign;
        var campaignAdvertiser = null;

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
            campaignAdvertiser = advertiser;
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
                    qs : { ext : false },
                    json: assign({}, json, {
                        tagParams: assign({}, json.tagParams, {
                            campaign: campaign.id
                        })
                    })
                })
                .spread(function uploadCreative(placement){
                    if (placement.tagType !== 'mraid'){
                        return placement;
                    }

                    var adUri = parseURL(campaign.product.uri);
                    var creative = {
                        advertiser_id : campaignAdvertiser.externalIds.beeswax,
                        creative_type : 0,
                        creative_template_id : 13,
                        width: 320,
                        height: 480,
                        sizeless : true,
                        secure: true,
                        creative_name : 'MRAID: ' + campaign.product.name,
                        creative_attributes : {
                            mobile : { mraid_playable : [ true ] },
                            technical : { 
                                banner_mime : [
                                    'text/javascript', 'application/javascript' 
                                ], 
                                tag_type : [ 3 ]
                            },
                            advertiser : {
                                advertiser_domain : [adUri.protocol + '//' +
                                    adUri.hostname ],
                                landing_page_url: [adUri.protocol + '//' +
                                    adUri.host + adUri.pathname],
                                advertiser_category : 
                                    appStoreToIABCats(campaign.product.categories)
                            },
                            video : { video_api: [ 3 ] }
                        },
                        creative_content: {},
                        active : true
                    };

                    var templatePath = path.join(__dirname,
                            '../../../../templates/beeswax/tags/mraid.html'),
                        tagHtml = fs.readFileSync(templatePath, 'utf8'),
                        opts = { placement: placement.id },
                        thumbnailUrl;
                    
                    Object.keys(placement.showInTag || {}).forEach(function(key) {
                        if (    placement.showInTag[key] === true && 
                                !!placement.tagParams[key]) {
                            opts[key] = placement.tagParams[key];
                        }
                    });
                    creative.creative_content.TAG 
                        = tagHtml.replace('%OPTIONS%', JSON.stringify(opts));
                    
                    (campaign.product.images || []).forEach(function(img){
                        if (img.type === 'thumbnail') {
                            thumbnailUrl = img.uri;
                        }
                    });

                    if (!thumbnailUrl){
                        log.warn('Can\'t find thumbnail in campaign %1 on placement %2',
                            campaign.id, placement.id);
                    }
    
                    return beeswax.uploadCreativeAsset({
                        sourceUrl    : thumbnailUrl,
                        advertiser_id: campaignAdvertiser.externalIds.beeswax
                    })
                    .then(function createCreative(asset){
                        creative.creative_thumbnail_url = asset.path_to_asset;
                        return beeswax.creatives.create(creative);
                    })
                    .then(function updatePlacement(result){
                        return request.put({
                            url: placementsEndpoint + '/' + placement.id,
                            json: assign({}, {
                                thumbnailSourceUrl : thumbnailUrl,
                                externalIds : { beeswax : result.payload.creative_id }
                            })
                        });
                    })
                    .catch(function(e){
                        log.warn('uploadCreative failed on placement %1 with: %2',
                           placement.id, (e.message  ? e.message : inspect(e)));
                        return [placement];
                    });
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
