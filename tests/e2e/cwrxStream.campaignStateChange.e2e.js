'use strict';

const Configurator = require('../helpers/Configurator.js');
const JsonProducer = require('rc-kinesis').JsonProducer;
const q = require('q');
const ld = require('lodash');
const uuid = require('rc-uuid');
const moment = require('moment');
const BeeswaxClient = require('beeswax-client');

const API_ROOT = process.env.apiRoot;
const AWS_CREDS = JSON.parse(process.env.awsCreds);
const CWRX_STREAM = process.env.cwrxStream;
const PREFIX = process.env.appPrefix;
const targeting = require('../helpers/targeting.json');

function createId(prefix) {
    return `${prefix}-${uuid.createUuid()}`;
}

function waitUntil(predicate) {
    function check() {
        return q(predicate()).then(function(value) {
            if (value) {
                return value;
            } else {
                return q.delay(500).then(check);
            }
        });
    }

    return check();
}

describe('cwrxStream campaignStateChange', function() {
    let producer, beeswax;

    function createBeeswaxEntities() {
        return beeswax.advertisers.create({
            advertiser_name: `E2E Test Advertiser (${uuid.createUuid()})`,
            active: true
        }).then(response => {
            const advertiser = response.payload;

            return beeswax.uploadCreativeAsset({
                sourceUrl: 'https://reelcontent.com/images/logo-nav.png',
                advertiser_id: advertiser.advertiser_id
            }).then(asset => (
                beeswax.creatives.create({
                    advertiser_id: advertiser.advertiser_id,
                    creative_type: 0,
                    creative_template_id: 13,
                    width: 300,
                    height: 250,
                    sizeless: true,
                    secure: true,
                    creative_name: `E2E Test Creative (${uuid.createUuid()})`,
                    creative_attributes: {
                        mobile: { mraid_playable: [true] },
                        technical: {
                            banner_mime: ['text/javascript', 'application/javascript'],
                            tag_type: [3]
                        },
                        advertiser: {
                            advertiser_app_bundle: ['com.rc.test-app'],
                            advertiser_domain: ['https://apps.reelcontent.com'],
                            landing_page_url: ['https://apps.reelcontent.com/site/'],
                            advertiser_category: ['IAB24']
                        },
                        video: { video_api: [3] }
                    },
                    creative_content: {
                        TAG: `
                            <script>
                                document.write([
                                    '<a href="{{CLICK_URL}}" target="_blank">',
                                    '    <img src="https://reelcontent.com/images/logo-nav.png" width="300" height="250" />,
                                    '</a>'
                                ].join('\\n');
                            </script>
                        `
                    },
                    creative_thumbnail_url: asset.path_to_asset,
                    active: true
                }).then(response => {
                    const creative = response.payload;

                    return beeswax.campaigns.create({
                        advertiser_id: advertiser.advertiser_id,
                        campaign_name: `E2E Test Campaign (${uuid.createUuid()})`,
                        campaign_budget: 1000,
                        budget_type: 1,
                        start_date: moment().format('YYYY-MM-DD'),
                        pacing: 0,
                        active: true
                    }).then(response => {
                        const campaign = response.payload;

                        return beeswax.targetingTemplates.create(ld.assign({}, targeting, {
                            template_name: `E2E Test Template (${uuid.createUuid()})`,
                            strategy_id: 1,
                            active: true
                        })).then(response => {
                            const targetingTemplate = response.payload;

                            return beeswax.lineItems.create({
                                campaign_id: campaign.campaign_id,
                                advertiser_id: advertiser.advertiser_id,
                                line_item_type_id: 0,
                                targeting_template_id: targetingTemplate.targeting_template_id,
                                line_item_name: `E2E Test Line Item (${uuid.createUuid()})`,
                                line_item_budget: 1000,
                                budget_type: 1,
                                bidding: {
                                    bidding_strategy: 'cpm',
                                    values: {
                                        cpm_bid: 1
                                    }
                                },
                                pacing: 1,
                                start_date: moment().format('YYYY-MM-DD'),
                                end_date: moment().add(1, 'week').format('YYYY-MM-DD'),
                                active: false
                            }).then(response => {
                                const lineItem = response.payload;

                                return beeswax.creativeLineItems.create({
                                    creative_id: creative.creative_id,
                                    line_item_id: lineItem.line_item_id,
                                    active: true
                                }).then(response => {
                                    const creativeLineItem = response.payload;

                                    return beeswax.lineItems.edit(lineItem.line_item_id, { active: true }).then(response => {
                                        const lineItem = response.payload;

                                        return {
                                            advertiser,
                                            creative,
                                            campaign,
                                            targetingTemplate,
                                            lineItem,
                                            creativeLineItem
                                        };
                                    });
                                });
                            });
                        });
                    });
                })
            ));
        });
    }

    function deleteBeeswaxEntities(entities) {
        const creativeLineItem = entities.creativeLineItem;
        const lineItem = entities.lineItem;
        const targetingTemplate = entities.targetingTemplate;
        const campaign = entities.campaign;
        const creative = entities.creative;
        const advertiser = entities.advertiser;

        return beeswax.lineItems.edit(lineItem.line_item_id, { active: false })
            .then(() => beeswax.creativeLineItems.delete(creativeLineItem.cli_id))
            .then(() => beeswax.lineItems.delete(lineItem.line_item_id))
            .then(() => beeswax.targetingTemplates.delete(targetingTemplate.targeting_template_id))
            .then(() => beeswax.campaigns.delete(campaign.campaign_id))
            .then(() => beeswax.creatives.edit(creative.creative_id, { active: false }))
            .then(() => beeswax.creatives.delete(creative.creative_id))
            .then(() => beeswax.advertisers.delete(advertiser.advertiser_id));
    }

    // This beforeAll is dedicated to setting application config
    beforeAll(function(done) {
        const configurator = new Configurator();
        const sharedConfig = {
            secrets: '/opt/sixxy/.watchman.secrets.json',
            appCreds: '/opt/sixxy/.rcAppCreds.json',
            cwrx: {
                api: {
                    root: API_ROOT
                }
            },
            emails: {
                sender: 'support@cinema6.com'
            },
            postmark: {
                templates: {
                }
            }
        };
        const cwrxConfig = {
            eventHandlers: {
                campaignStateChange: {
                    actions: [
                        {
                            name: 'showcase/apps/clean_up_campaign',
                            options: {},
                            ifData: {
                                currentState: 'canceled',
                                'campaign.application': '^showcase$',
                                'campaign.product.type': '^app$'
                            }
                        }
                    ]
                }
            }
        };
        const timeConfig = {
            eventHandlers: { }
        };
        const watchmanConfig = {
            eventHandlers: { }
        };
        Promise.all([
            configurator.updateConfig(`${PREFIX}CwrxStreamApplication`, sharedConfig, cwrxConfig),
            configurator.updateConfig(`${PREFIX}TimeStreamApplication`, sharedConfig, timeConfig),
            configurator.updateConfig(`${PREFIX}WatchmanStreamApplication`, sharedConfig, watchmanConfig)
        ]).then(done, done.fail);
    });

    beforeAll(function() {
        const awsConfig = ld.assign({ region: 'us-east-1' }, AWS_CREDS || {});

        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;

        producer = new JsonProducer(CWRX_STREAM, awsConfig);
        beeswax = new BeeswaxClient({
            creds: {
                email: 'ops@cinema6.com',
                password: '07743763902206f2b511bead2d2bf12292e2af82'
            }
        });
    });

    describe('for a showcase (apps) campaign', function() {
        let campaign, beeswaxEntities;

        function produce() {
            return producer.produce({
                type: 'campaignStateChange',
                data: {
                    campaign,
                    date: moment().format(),
                    previousState: 'active',
                    currentState: campaign.status
                }
            });
        }

        beforeEach(function(done) {
            createBeeswaxEntities().then(entities => {
                beeswaxEntities = entities;

                campaign = {
                    id: createId('cam'),
                    status: 'canceled',
                    application: 'showcase',
                    product: {
                        type: 'app'
                    },
                    externalCampaigns: {
                        beeswax: {
                            externalId: beeswaxEntities.campaign.campaign_id
                        }
                    }
                };
            }).then(() => (
                produce()
            )).then(() => waitUntil(() => Promise.all([
                beeswax.lineItems.find(beeswaxEntities.lineItem.line_item_id).then(response => response.payload && !response.payload.active && response.payload),
                beeswax.campaigns.find(beeswaxEntities.campaign.campaign_id).then(response => response.payload && !response.payload.active && response.payload)
            ]).then(items => items.every(item => !!item) && items)).then(items => {
                beeswaxEntities.lineItem = items[0];
                beeswaxEntities.campaign = items[1];
            })).then(done, done.fail);
        });

        afterEach(function(done) {
            deleteBeeswaxEntities(beeswaxEntities).then(done, done.fail);
        });

        it('should deactivate the line items', function() {
            expect(beeswaxEntities.lineItem.active).toBe(false);
        });

        it('should deactivate the campaign', function() {
            expect(beeswaxEntities.campaign.active).toBe(false);
        });
    });
});
