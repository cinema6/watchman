'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
var q = require('q');
var ld = require('lodash');
var logger = require('cwrx/lib/logger.js');
var fetchProductDataFactory = require('../../src/actions/fetch_product_data.js');
var resolveURL = require('url').resolve;

describe('fetch_product_data.js', function() {
    var req, mockLog, mockCampaigns, dataEndpoint, campEndpoint;

    beforeEach(function() {
        this.mockOptions = { };
        this.mockConfig = {
            appCreds: {},
            cwrx: {
                api: {
                    root: 'root',
                    campaigns: { endpoint: 'endpoint' },
                    productData: {endpoint: 'endpoint'}
                }
            },
            kinesis: {
                producer: {
                    stream: 'stream'
                }
            }
        };

        dataEndpoint = resolveURL(this.mockConfig.cwrx.api.root, this.mockConfig.cwrx.api.productData.endpoint);
        campEndpoint = resolveURL(this.mockConfig.cwrx.api.root, this.mockConfig.cwrx.api.campaigns.endpoint);

        mockLog = {
            trace : jasmine.createSpy('log_trace'),
            error : jasmine.createSpy('log_error'),
            warn  : jasmine.createSpy('log_warn'),
            info  : jasmine.createSpy('log_info'),
            fatal : jasmine.createSpy('log_fatal'),
            log   : jasmine.createSpy('log_log')
        };

        mockCampaigns = [
            { //default
                advertiserId: 'a-0Gz4jn091PJ1wOSE',
                application: 'showcase',
                created: '2016-05-26T20:21:02.270Z',
                externalCampaigns: {
                    beeswax: {
                        budget: 3042.06,
                        dailyLimit: 1,
                        externalId: 1830
                    }
                },
                id: 'cam-0aa3KU070S85KkLn',
                lastUpdated: '2016-05-26T20:21:07.560Z',
                name: 'Count Coins',
                org:'o-0gW2wr070RogoxlE',
                pricing: {
                    budget: 6082.12,
                    dailyLimit: 2,
                    model: 'cpv',
                    cost: 0.05
                },
                pricingHistory: [
                    {
                        date: '2016-05-26T20:21:07.129Z',
                        pricing: {
                            budget: 6082.12,
                            dailyLimit: 2,
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
                    name: 'Count Coins',
                    description: 'Reinforce basic counting skills by counting coins. This app is a valuable tool for elementary school aged children building fundamental counting skills.  It can also be a useful training assistant for those seeking work as cashiers, where making change accurately is important.',
                    developer: 'Howard Engelhart',
                    uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
            },
            { //out-of-date
                advertiserId: 'a-0Gz4jn091PJ1wOSE',
                application: 'showcase',
                created: '2016-05-26T20:21:02.270Z',
                externalCampaigns: {
                    beeswax: {
                        budget: 3042.06,
                        dailyLimit: 1,
                        externalId: 1830
                    }
                },
                id: 'cam-0aa3KU070S85KkLn',
                lastUpdated: '2016-05-26T20:21:07.560Z',
                name: 'Count Coins',
                org:'o-0gW2wr070RogoxlE',
                pricing: {
                    budget: 6082.12,
                    dailyLimit: 2,
                    model: 'cpv',
                    cost: 0.05
                },
                pricingHistory: [
                    {
                        date: '2016-05-26T20:21:07.129Z',
                        pricing: {
                            budget: 6082.12,
                            dailyLimit: 2,
                            model: 'cpv',
                            cost: 0.05
                        },
                        appId: 'app-0Gz5_901JeSXB5OA',
                        appKey: 'watchman-app'
                    }
                ],
                product: {
                    type: 'blah',
                    platform: 'wtvr',
                    name: 'Count Coins',
                    description: 'some other description',
                    developer: 'Howard Engelhart',
                    uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
            },
            { //description only changed
                advertiserId: 'a-0Gz4jn091PJ1wOSE',
                application: 'showcase',
                created: '2016-05-26T20:21:02.270Z',
                externalCampaigns: {
                    beeswax: {
                        budget: 3042.06,
                        dailyLimit: 1,
                        externalId: 1830
                    }
                },
                id: 'cam-0aa3KU070S85KkLn',
                lastUpdated: '2016-05-26T20:21:07.560Z',
                name: 'Count Coins',
                org:'o-0gW2wr070RogoxlE',
                pricing: {
                    budget: 6082.12,
                    dailyLimit: 2,
                    model: 'cpv',
                    cost: 0.05
                },
                pricingHistory: [
                    {
                        date: '2016-05-26T20:21:07.129Z',
                        pricing: {
                            budget: 6082.12,
                            dailyLimit: 2,
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
                    name: 'Count Coins',
                    description: 'shouldn\'t change',
                    developer: 'Howard Engelhart',
                    uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
            },
            { //name only changed
                advertiserId: 'a-0Gz4jn091PJ1wOSE',
                application: 'showcase',
                created: '2016-05-26T20:21:02.270Z',
                externalCampaigns: {
                    beeswax: {
                        budget: 3042.06,
                        dailyLimit: 1,
                        externalId: 1830
                    }
                },
                id: 'cam-0aa3KU070S85KkLn',
                lastUpdated: '2016-05-26T20:21:07.560Z',
                name: 'Count Coins',
                org:'o-0gW2wr070RogoxlE',
                pricing: {
                    budget: 6082.12,
                    dailyLimit: 2,
                    model: 'cpv',
                    cost: 0.05
                },
                pricingHistory: [
                    {
                        date: '2016-05-26T20:21:07.129Z',
                        pricing: {
                            budget: 6082.12,
                            dailyLimit: 2,
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
                    name: 'ignore me',
                    description: 'Reinforce basic counting skills by counting coins. This app is a valuable tool for elementary school aged children building fundamental counting skills.  It can also be a useful training assistant for those seeking work as cashiers, where making change accurately is important.',
                    developer: 'Howard Engelhart',
                    uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
            },
            { //name and description changed only
                advertiserId: 'a-0Gz4jn091PJ1wOSE',
                application: 'showcase',
                created: '2016-05-26T20:21:02.270Z',
                externalCampaigns: {
                    beeswax: {
                        budget: 3042.06,
                        dailyLimit: 1,
                        externalId: 1830
                    }
                },
                id: 'cam-0aa3KU070S85KkLn',
                lastUpdated: '2016-05-26T20:21:07.560Z',
                name: 'Count Coins',
                org:'o-0gW2wr070RogoxlE',
                pricing: {
                    budget: 6082.12,
                    dailyLimit: 2,
                    model: 'cpv',
                    cost: 0.05
                },
                pricingHistory: [
                    {
                        date: '2016-05-26T20:21:07.129Z',
                        pricing: {
                            budget: 6082.12,
                            dailyLimit: 2,
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
                    name: 'ignore me',
                    description: 'ignore me too',
                    developer: 'Howard Engelhart',
                    uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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

        req = require('../../lib/CwrxRequest');
        spyOn(req.prototype, 'put').and.returnValue().and.callFake(function(requestConfig) {
            return q.resolve([ld.assign({}, mockCampaigns[1].id, requestConfig.json)]);
        });
        spyOn(logger, 'getLog').and.returnValue(mockLog);
        spyOn(JsonProducer.prototype, 'produce');

        this.mockData =
            {
                type: 'app',
                platform: 'iOS',
                name: 'Count Coins',
                description: 'Reinforce basic counting skills by counting coins. This app is a valuable tool for elementary school aged children building fundamental counting skills.  It can also be a useful training assistant for those seeking work as cashiers, where making change accurately is important.',
                developer: 'Howard Engelhart',
                uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
            };

        this.fetchProductData = fetchProductDataFactory(this.mockConfig);
    });

    describe('fetching product data', function() {
        beforeEach(function(done) {
            spyOn(req.prototype, 'get').and.returnValue(
                new q.promise(function(resolve) {
                    resolve(
                        [
                            {
                                type: 'app',
                                platform: 'iOS',
                                name: 'Count Coins',
                                description: 'Reinforce basic counting skills by counting coins. This app is a valuable tool for elementary school aged children building fundamental counting skills.  It can also be a useful training assistant for those seeking work as cashiers, where making change accurately is important.',
                                developer: 'Howard Engelhart',
                                uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
                        ]
                    );
                })
            );
            process.nextTick(done);
        });

        describe('if campaign data is up-to-date', function() {
            beforeEach(function(done) {
                var self = this;

                self.fetchProductData({ data: {campaign: mockCampaigns[0]}, options: self.mockOptions })
                .then(function() {
                    done();
                }).catch(function(error) {
                    done.fail(error);
                });
            });
            it('should not update the campaign', function() {
                expect(req.prototype.put).not.toHaveBeenCalled();
                expect(mockLog.info).toHaveBeenCalled();
            });

            it('should not produce a record', function() {
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
            });
        });

        describe('changes that should not cause the campaign to update', function() {
            beforeEach(function(done) {
                var self = this;

                self.fetchProductData({ data: {campaign: mockCampaigns[2]}, options: self.mockOptions })
                .then(function() {
                    done();
                }).catch(function(error) {
                    done.fail(error);
                });
            });

            describe ('a change in name only', function() {
                beforeEach(function(done) {
                    var self = this;

                    self.fetchProductData({ data: {campaign: mockCampaigns[3]}, options: self.mockOptions })
                    .then(function() {
                        done();
                    }).catch(function(error) {
                        done.fail(error);
                    });
                });
            });
            describe ('a change in name and description only', function() {
                beforeEach(function(done) {
                    var self = this;

                    self.fetchProductData({ data: {campaign: mockCampaigns[4]}, options: self.mockOptions })
                    .then(function() {
                        done();
                    }).catch(function(error) {
                        done.fail(error);
                    });
                });
            });

            afterEach(function() {
                expect(req.prototype.put).not.toHaveBeenCalled();
                expect(JsonProducer.prototype.produce).not.toHaveBeenCalled();
                expect(mockLog.info).toHaveBeenCalled();
            });
        });

        describe('if a campaign needs to be updated', function() {
            beforeEach(function(done) {
                var self = this;

                self.fetchProductData({ data: {campaign: mockCampaigns[1]}, options: self.mockOptions })
                .then(function() {
                    done();
                }).catch(function(error) {
                    done.fail(error);
                });
            });

            it('should update the campaign', function() {
                    expect(req.prototype.put).toHaveBeenCalledWith({
                        url: campEndpoint + '/' + mockCampaigns[1].id,
                        json: {
                            product: {
                                type: 'app',
                                platform: 'iOS',
                                name: 'Count Coins',
                                description: 'some other description',
                                developer: 'Howard Engelhart',
                                uri: 'https://itunes.apple.com/us/app/count-coins/id595124272?mt=8&uo=4',
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
                    });
            });

            it('should not update the campaign name or description', function() {

            });

            it ('should produce a new record', function() {
                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                    type: 'campaignRefreshed',
                    data: {
                        campaign: mockCampaigns[1],
                        date: new Date()
                    }
                });
                expect(mockLog.info).toHaveBeenCalled();
            });

        });
    });
});
