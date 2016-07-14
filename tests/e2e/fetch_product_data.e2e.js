'use strict';

var JsonProducer            = require('rc-kinesis').JsonProducer;
var q                       = require('q');
var testUtils               = require('cwrx/test/e2e/testUtils.js');
var CwrxRequest             = require('../../lib/CwrxRequest');
var resolveURL              = require('url').resolve;
var moment                  = require('moment');

var APP_CREDS               = JSON.parse(process.env.appCreds);
var AWS_CREDS               = JSON.parse(process.env.awsCreds);
var WATCHMAN_STREAM         = process.env.watchmanStream;

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

fdescribe('timeStream', function() {
    var producer, mockCampaigns, mockAdvert, awsConfig;

    beforeAll(function() {
        awsConfig = {
            region: 'us-east-1',
            cwrx: {
                api: {
                    root: 'http://33.33.33.10',
                    productData : {
                        endpoint: '/api/collateral/product-data'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    },
                }
            }
        };
        if(AWS_CREDS) {
            awsConfig.accessKeyId = AWS_CREDS.accessKeyId;
            awsConfig.secretAccessKey = AWS_CREDS.secretAccessKey;
        }
        producer = new JsonProducer(WATCHMAN_STREAM, awsConfig);
    });

    beforeEach(function(done) {
        jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000;
        mockAdvert = {
          'name': 'olivia test advert',
          'id': 'a-0Gz4jn091PJ1wOSE',
          'created': '2016-06-20T21:21:27.984Z',
          'lastUpdated': '2016-06-20T21:21:27.984Z',
          'status': 'active',
          'org': 'o-test',
          'beeswaxIds': {
            'advertiser': 28265
          }
        };

        mockCampaigns = [
            { //default
                advertiserId: 'a-0Gz4jn091PJ1wOSE',
                application: 'showcase',
                created: '2016-05-26T20:21:02.270Z',
                externalCampaigns: {
                    beeswax: {
                        budget: 3042.06,
                        dailyLimit: 100,
                        externalId: 1830
                    }
                },
                id: 'e2e-test-1',
                lastUpdated: moment().subtract(1, 'week').format(),
                name: 'Count Coins',
                org:'o-0gW2wr070RogoxlE',
                pricing: {
                    budget: 6082.12,
                    dailyLimit: 100,
                    model: 'cpv',
                    cost: 0.05
                },
                pricingHistory: [
                    {
                        date: '2016-05-26T20:21:07.129Z',
                        pricing: {
                            budget: 6082.12,
                            dailyLimit: 100,
                            model: 'cpv',
                            cost: 0.05
                        },
                        appId: 'app-0Gz5_901JeSXB5OA',
                        appKey: 'watchman-app'
                    }
                ],
                product: {
                    type: 'app',
                    platform: 'iOS',
                    name: 'Pokemon Go Tester',
                    description: 'Test Description',
                    developer: 'Niantic Inc.',
                    uri: 'https://itunes.apple.com/nz/app/pokemon-go/id1094591345?mt=8',
                    categories: [
                        'Education',
                        'Games',
                        'Educational'
                    ],
                    price: 'Free',
                    extID: 595124272,
                    images: [
                        {
                            uri: 'http://a1.mzstatic.com/us/r30/Purple/v4/c2/ec/6b/c2ec6b9a-d47b-20e4-d1f7-2f42fffcb58f/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://a5.mzstatic.com/us/r30/Purple/v4/fc/4b/e3/fc4be397-6865-7011-361b-59f78c789e62/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://a5.mzstatic.com/us/r30/Purple/v4/f9/02/63/f902630c-3969-ab9f-07b4-2c91bd629fd0/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://a3.mzstatic.com/us/r30/Purple/v4/f8/21/0e/f8210e8f-a75a-33c0-9e86-e8c65c9faa54/screen1136x1136.jpeg',
                            type: 'screenshot',
                            device: 'phone'
                        },
                        {
                            uri: 'http://is5.mzstatic.com/image/thumb/Purple/v4/ef/a0/f3/efa0f340-225e-e512-1616-8f223c6202ea/source/512x512bb.jpg',
                            type: 'thumbnail'
                        }
                    ]
                }
            }
        ];



        var mockApp = {
        	id: 'app-watchman',
        	key: APP_CREDS.key,
        	status: 'active',
        	secret: APP_CREDS.secret,
        	permissions: {
        		campaigns: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
        		cards: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
        		users: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
        		orgs: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
        		placements: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
        		advertisers: { read: 'all', create: 'all', edit: 'all', delete: 'all' },
        		promotions: { read: 'all' },
        		transactions: { create: 'all' }
        	},
        	entitlements: {
        		directEditCampaigns: true,
        		makePaymentForAny: true
        	},
        	fieldValidation: {
        		campaigns: {
        			status: {
        				__allowed: true
        			},
        			cards: {
        				__length: Infinity
        			},
        			pricing: {
        				dailyLimit: {
        					__percentMin: 0
        				}
        			}
        		},
        		orgs: {
        			paymentPlanStart: { __allowed: true },
        			paymentPlanId: { __allowed: true },
        			promotions: { __allowed: true }
        		},
        		cards: {
        			user: {
        				__allowed: true
        			},
        			org: {
        				__allowed: true
        			}
        		}
        	}
        };

        q.all([
            testUtils.resetCollection('advertisers', mockAdvert),
            testUtils.resetCollection('campaigns', mockCampaigns),
            testUtils.mongoUpsert('applications', { key: 'watchman-app' }, mockApp)
        ]).then(done, done.fail);
    });

    afterAll(function(done) {
        testUtils.closeDbs().then(done, done.fail);
    });



    describe('the time event prompting campaign data to be fetched', function() {
        var dataEndpoint, campEndpoint, request;
        beforeEach(function(done) {
            request = new CwrxRequest(APP_CREDS);
            dataEndpoint = resolveURL(awsConfig.cwrx.api.root, awsConfig.cwrx.api.productData.endpoint);
            producer.produce({ type: 'hourly_campaignPulse', data: { campaign: mockCampaigns[0], date: new Date() } }).then(done, done.fail);
            campEndpoint = resolveURL(awsConfig.cwrx.api.root, awsConfig.cwrx.api.campaigns.endpoint);
        });
        describe('should update an out-of-date campaign', function(){
            beforeEach(function(done) {


                waitUntil(function() {
                    return request.get({
                        url: campEndpoint + '/' + mockCampaigns[0].id,
                    }).spread(function(data) {
                        return moment(data.lastUpdated).isSame(moment(), 'day');
                    });
                }).then(done, done.fail);

            });
            it ('should not overwrite the name or description parameters', function(done) {

                request.get({
                    url: campEndpoint + '/' + mockCampaigns[0].id,
                }).spread(function watchmanData(data) {
                    expect(data.product.name).toEqual(mockCampaigns[0].product.name);
                    expect(data.product.description).toEqual(mockCampaigns[0].product.description);

                    return request.get({
                        url: dataEndpoint,
                        qs: {uri: mockCampaigns[0].product.uri}
                    }).spread(function appData(mockData) {
                        mockData.name = mockCampaigns[0].product.name;
                        mockData.description = mockCampaigns[0].product.description;
                        expect(data.product.images).toEqual(mockData.images);
                    });
                }).then(done, done.fail);
            });

        });

    });
});
