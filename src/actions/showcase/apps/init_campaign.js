'use strict';

const CwrxRequest = require('../../../../lib/CwrxRequest');
const BeeswaxMiddleware = require('../../../../lib/BeeswaxMiddleware');
const JsonProducer = require('rc-kinesis').JsonProducer;
const logger = require('cwrx/lib/logger');
const resolveURL = require('url').resolve;
const inspect = require('util').inspect;
const appFactories = require('showcase-core').factories.app;
const assign = require('lodash').assign;
const takeRight = require('lodash').takeRight;
const unzip = require('lodash').unzip;
const mapValues = require('lodash').mapValues;
const pickBy = require('lodash').pickBy;
const q = require('q');

const createInterstitialFactory = appFactories.createInterstitialFactory;

module.exports = function factory(config) {
    const log = logger.getLog();
    const beeswax = new BeeswaxMiddleware(
        { apiRoot: config.beeswax.apiRoot, creds: config.state.secrets.beeswax},
        { creds: config.appCreds, api: config.cwrx.api }
    );
    const request = new CwrxRequest(config.appCreds);
    const stream = new JsonProducer(config.kinesis.producer.stream, config.kinesis.producer);
    const showcase = require('../../../../lib/showcase')(config);

    const campaignsEndpoint = resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint);
    const placementsEndpoint = resolveURL(
        config.cwrx.api.root,
        config.cwrx.api.placements.endpoint
    );

    return event => Promise.resolve().then(() => {
        const data = event.data;
        const options = event.options;
        const campaign = data.campaign;

        const createInterstitial = createInterstitialFactory(
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
            json: {
                conversionMultipliers: {
                    internal: config.campaign.conversionMultipliers.internal,
                    external: config.campaign.conversionMultipliers.external
                },
                cards: campaign.cards.concat([
                    setupCard(createInterstitial(campaign.product))
                ])
            }
        }).spread(campaign => {
            const newCards = takeRight(campaign.cards, 1);
            const interstitial = newCards[0];

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
            ].map(json => request.post({
                url: placementsEndpoint,
                qs: { ext: false },
                json: assign({}, json, {
                    tagParams: assign({}, json.tagParams, {
                        campaign: campaign.id
                    })
                })
            }))).then(unzip).spread(placements => {
                log.trace(
                    'Created placements for card([%1 => %2]).',
                    newCards[0].id, placements[0].id
                );

                log.trace('Initializing campaign %1 in beeswax!', campaign.id);

                return beeswax.initShowcaseAppsCampaign({
                    campaign: campaign,
                    placements: placements
                });
            }).then(bwResponse => {
                log.trace('Rebalance after campaign %1 created in beeswax!', campaign.id);
                return showcase.rebalance(bwResponse.campaign.org).then(() => {
                    log.trace(
                        'Producing "initializedShowcaseCampaign" for showcase (app) campaign(%1).',
                        campaign.id
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
            });
        }).tap(() => (
            log.info('Successfully initialized showcase (app) campaign(%1).', campaign.id)
        )).catch(reason => log.error(
            'Failed to initialize showcase (app) campaign(%1): %2',
            campaign.id, inspect(reason)
        ));
    }).then(() => undefined);
};
