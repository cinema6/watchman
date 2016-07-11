'use strict';

const proxyquire = require('proxyquire').noCallThru();

describe('(action factory) showcase/apps/init_campaign', function() {
    var q, uuid, resolveURL, ld, logger, showcaseFactories;
    var JsonProducer, CwrxRequest, BeeswaxMiddleware;
    var factory;

    beforeAll(function() {
        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;
        ld = require('lodash');
        logger = require('cwrx/lib/logger');
        showcaseFactories = require('showcase-core').factories;

        JsonProducer = jasmine.createSpy('JsonProducer()').and.callFake(() => ({
            produce: jasmine.createSpy('produce()').and.returnValue(q.defer().promise)
        }));
        CwrxRequest = jasmine.createSpy('CwrxRequest()').and.callFake(() => ({
            send: jasmine.createSpy('send()').and.returnValue(q.defer().promise),
            post: () => null,
            put: () => null
        }));

        BeeswaxMiddleware = jasmine.createSpy('BeeswaxMiddleware()').and.callFake(() => ({
            initShowcaseAppsCampaign : () => null
        }));

        factory = proxyquire('../../src/actions/showcase/apps/init_campaign', {
            'rc-kinesis': {
                JsonProducer: JsonProducer
            },
            '../../../../lib/CwrxRequest': CwrxRequest,
            '../../../../lib/BeeswaxMiddleware': BeeswaxMiddleware
        });
    });

    beforeEach(function() {
        [JsonProducer, CwrxRequest].forEach(function(spy) {
            spy.calls.reset();
        });
    });

    it('should exist', function() {
        expect(factory).toEqual(jasmine.any(Function));
        expect(factory.name).toBe('initCampaignFactory');
    });

    describe('when called', function() {
        var config;
        var initCampaign;
        var request, watchmanStream, log, beeswax;

        beforeEach(function() {
            config = {
                appCreds: {
                    key: 'watchman-dev',
                    secret: 'dwei9fhj3489ghr7834909r'
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        advertisers : {
                            endpoint: '/api/advertisers'
                        },
                        placements: {
                            endpoint: '/api/placements'
                        },
                        campaigns: {
                            endpoint: '/api/campaigns'
                        },
                        tracking : 'https://audit.cinema6.com/pixel.gif'
                    }
                },
                kinesis: {
                    producer: {
                        region: 'us-east-1',
                        stream: 'devWatchmanStream'
                    }
                },
                state: {
                    secrets: {
                        beeswax: {
                            email: 'ops@reelcontent.com',
                            password: 'wueyrfhu83rgf4u3gr'
                        }
                    }
                },
                beeswax: {
                    apiRoot: 'https://stingersbx.api.beeswax.com'
                }
            };

            spyOn(logger, 'getLog').and.returnValue(log = jasmine.createSpyObj('log', [
                'info',
                'trace',
                'warn',
                'error'
            ]));

            initCampaign = factory(config);

            request = CwrxRequest.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
            beeswax = BeeswaxMiddleware.calls.mostRecent().returnValue;
        });

        it('should return the action Function', function() {
            expect(initCampaign).toEqual(jasmine.any(Function));
            expect(initCampaign.name).toBe('initCampaign');
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        it('should create a JsonProducer', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });
        
        it('should create a BeeswaxMiddleware', function() {
            expect(BeeswaxMiddleware).toHaveBeenCalledWith( {
                apiRoot : config.beeswax.apiRoot,
                creds   : config.state.secrets.beeswax
            },{
                creds : config.appCreds,
                api : config.cwrx.api
            });
        });


        describe('the action', function() {
            var data, options, event;
            var putCampaignDeferred;
            var success, failure;

            beforeEach(function(done) {
                data = {
                    campaign: {
                        id: 'cam-' + uuid.createUuid(),
                        advertiserDisplayName: 'Curbside',
                        advertiserId: 'a-' + uuid.createUuid(),
                        application: 'showcase',
                        cards: [],
                        created: '2016-03-17T21:18:48.953Z',
                        lastUpdated: '2016-03-18T14:13:35.918Z',
                        name: 'This is the Name of My Product',
                        org: 'o-' + uuid.createUuid(),
                        status: 'active',
                        product: {
                            type: 'app',
                            platform: 'iOS',
                            name: 'iAnnotate 4 - read, markup and share PDFs and more',
                            description: 'This app rules!',
                            uri: 'https://itunes.apple.com/us/app/iannotate-4-read-markup-share/id1093924230?mt=8&uo=4',
                            categories: [
                                'Productivity',
                                'Business'
                            ],
                            price: '$3.99',
                            extID: 1093924230,
                            developer: 'The App Shoppe Inc',
                            rating: 4,
                            images: [
                                {
                                    uri: 'http://a1.mzstatic.com/us/r30/Purple20/v4/5f/05/da/5f05da2d-0680-c82b-4a90-349fd48573d7/screen322x572.jpeg',
                                    type: 'screenshot',
                                    device: 'phone'
                                },
                                {
                                    uri: 'http://a5.mzstatic.com/us/r30/Purple18/v4/b3/89/fd/b389fde4-51c9-22d1-3613-c5ea3a4168b9/screen322x572.jpeg',
                                    type: 'screenshot',
                                    device: 'phone'
                                },
                                {
                                    uri: 'http://a3.mzstatic.com/us/r30/Purple20/v4/4c/05/98/4c059850-f78f-87b7-aed6-51977732dcd8/screen322x572.jpeg',
                                    type: 'screenshot',
                                    device: 'phone'
                                },
                                {
                                    uri: 'http://a1.mzstatic.com/us/r30/Purple30/v4/f0/c6/0a/f0c60a41-d3b8-1c6e-e7bc-a625b1590c5f/screen322x572.jpeg',
                                    type: 'screenshot',
                                    device: 'phone'
                                },
                                {
                                    uri: 'http://a2.mzstatic.com/us/r30/Purple20/v4/f7/03/e1/f703e166-2ea6-07f2-67f9-84027811c87e/screen322x572.jpeg',
                                    type: 'screenshot',
                                    device: 'phone'
                                },
                                {
                                    uri: 'http://a3.mzstatic.com/us/r30/Purple60/v4/a5/98/68/a5986803-66f9-ce15-afd7-ed1a2bdbd40c/screen480x480.jpeg',
                                    type: 'screenshot',
                                    device: 'tablet'
                                },
                                {
                                    uri: 'http://a4.mzstatic.com/us/r30/Purple30/v4/e0/31/3b/e0313b5b-94c5-340f-6793-034005b649b9/screen480x480.jpeg',
                                    type: 'screenshot',
                                    device: 'tablet'
                                },
                                {
                                    uri: 'http://a2.mzstatic.com/us/r30/Purple20/v4/e2/c3/62/e2c36200-fea7-165f-6adf-afb516cdbb4c/screen480x480.jpeg',
                                    type: 'screenshot',
                                    device: 'tablet'
                                },
                                {
                                    uri: 'http://a4.mzstatic.com/us/r30/Purple60/v4/8c/19/d7/8c19d77a-8738-8c11-f57a-535f693724f1/screen480x480.jpeg',
                                    type: 'screenshot',
                                    device: 'tablet'
                                },
                                {
                                    uri: 'http://a1.mzstatic.com/us/r30/Purple20/v4/5a/f2/de/5af2de87-8ba5-07b2-0f90-f5d3cb0795bf/screen480x480.jpeg',
                                    type: 'screenshot',
                                    device: 'tablet'
                                },
                                {
                                    uri: 'http://is1.mzstatic.com/image/thumb/Purple49/v4/df/4d/77/df4d77af-c3d8-671e-0bd2-a3ce288edbd5/source/512x512bb.jpg',
                                    type: 'thumbnail'
                                }
                            ]
                        },
                        statusHistory: [],
                        pricing: {
                            model: 'cpv',
                            cost: 0.06,
                            budget: 500,
                            dailyLimit: 50
                        },
                        pricingHistory: [
                            {
                                date: '2016-03-17T21:30:40.359Z',
                                pricing: {
                                    model: 'cpv',
                                    cost: 0.06,
                                    budget: 500,
                                    dailyLimit: 50
                                },
                                userId: 'u-' + uuid.createUuid(),
                                user: 'hoopes@shopcurbside.com'
                            }
                        ],
                        targeting: {
                            demographics: {
                                age: [],
                                gender: []
                            },
                            appStoreCategory: [],
                            device: {
                                type: [],
                                osVersion: []
                            }
                        },
                        user: 'u-' + uuid.createUuid()
                    },
                    date: new Date().toISOString()
                };
                options = {
                    card: {
                        interstitial: {
                            duration: 15,
                            slideCount: 3,
                            cardType: 'showcase-app'
                        }
                    },
                    placement: {
                        interstitial: {
                            tagType: 'mraid',
                            tagParams: {
                                container: { value: 'beeswax' },
                                type: { value: 'mobile-card' },
                                branding: { value: 'showcase-app--interstitial' },
                                uuid: { value: '{{DEVICE_ID}}', inTag: true }
                            }
                        }
                    }
                };
                event = { data: data, options: options };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');

                spyOn(request, 'post');
                spyOn(request, 'put')
                    .and.returnValue((putCampaignDeferred = q.defer()).promise);

                initCampaign(event).then(success, failure);
                process.nextTick(done);
            });

            describe('when the external campaign is created', function() {
                it('should add one card to the campaign', function() {
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint + '/' + data.campaign.id),
                        json: ld.assign({}, data.campaign, {
                            cards: data.campaign.cards.concat([
                                ld.assign(showcaseFactories.app.createInterstitialFactory(options.card.interstitial)(data.campaign.product), {
                                    user: data.campaign.user,
                                    org: data.campaign.org
                                })
                            ])
                        })
                    });
                });

                describe('if creating the cards fails', function() {
                    var reason;

                    beforeEach(function(done) {
                        request.post.calls.reset();
                        request.post.and.returnValue(q.defer().promise);

                        reason = new Error('I failed you...');
                        putCampaignDeferred.reject(reason);
                        process.nextTick(done);
                    });

                    it('should not POST anything', function() {
                        expect(request.post).not.toHaveBeenCalled();
                    });

                    it('should log an error', function() {
                        expect(log.error).toHaveBeenCalled();
                    });

                    it('should fulfill with undefined', function() {
                        expect(success).toHaveBeenCalledWith(undefined);
                    });
                });

                describe('when the cards have been created', function() {
                    var postPlacementDeffereds;
                    var campaign, interstitial ;

                    beforeEach(function(done) {
                        request.post.calls.reset();

                        postPlacementDeffereds = [];
                        request.post.and.callFake(function() {
                            var deferred = q.defer();

                            postPlacementDeffereds.push(deferred);

                            return deferred.promise;
                        });

                        campaign = request.put.calls.mostRecent().args[0].json;
                        campaign = ld.assign({}, campaign, {
                            cards: campaign.cards.map(function(card) {
                                return ld.assign({}, card, {
                                    id: 'rc-' + uuid.createUuid()
                                });
                            })
                        });
                        interstitial = campaign.cards[0];

                        putCampaignDeferred.fulfill([
                            campaign,
                            { statusCode: 200 }
                        ]);
                        process.nextTick(done);
                    });

                    it('should create one placement', function() {
                        expect(request.post.calls.count()).toBe(1, 'Wrong number of placements created!');

                        expect(request.post).toHaveBeenCalledWith({
                            url: resolveURL(config.cwrx.api.root, config.cwrx.api.placements.endpoint),
                            qs : { ext : false },
                            json: {
                                label: 'Showcase--Interstitial for App: "' + campaign.name + '"',
                                tagType: options.placement.interstitial.tagType,
                                tagParams: {
                                    campaign: campaign.id,
                                    card: interstitial.id,
                                    container: 'beeswax',
                                    type: 'mobile-card',
                                    branding: 'showcase-app--interstitial',
                                    uuid: '{{DEVICE_ID}}'
                                },
                                showInTag: {
                                    uuid: true
                                },
                                thumbnail: interstitial.thumbs.small
                            }
                        });
                    });

                    describe('if creating a placement fails', function() {
                        var reason;

                        beforeEach(function(done) {
                            watchmanStream.produce.and.returnValue(q.defer().promise);

                            reason = new Error('I failed you...');
                            postPlacementDeffereds[0].reject(reason);
                            process.nextTick(done);
                        });

                        it('should not produce any records', function() {
                            expect(watchmanStream.produce).not.toHaveBeenCalled();
                        });

                        it('should log an error', function() {
                            expect(log.error).toHaveBeenCalled();
                        });

                        it('should fulfill with undefined', function() {
                            expect(success).toHaveBeenCalledWith(undefined);
                        });
                    });

                    describe('when the placements have been created', function(){
                        var initShowcaseDeferred, placements;
                        beforeEach(function(done) {
                            initShowcaseDeferred = q.defer();

                            spyOn(beeswax,'initShowcaseAppsCampaign').and.returnValue(
                                initShowcaseDeferred.promise);

                            expect(postPlacementDeffereds.length).toBe(1);

                            placements = [];
                            postPlacementDeffereds.forEach(function(deferred, index) {
                                var placement = ld.assign({}, request.post.calls.all()[index].args[0].json, {
                                    id: 'pl-' + uuid.createUuid()
                                });

                                placements.push(placement);

                                deferred.fulfill([placement, { statusCode: 201 }]);
                            });
                            process.nextTick(done);
                        });
                       
                        it('should call beeswax middleware',function(){
                            expect(beeswax.initShowcaseAppsCampaign).toHaveBeenCalledWith({
                                campaign : campaign,
                                placements : placements
                            });
                        });

                        describe('when the beeswax middleware fails',function(){
                            beforeEach(function(done){
                                var reason = new Error('I failed you...');
                                initShowcaseDeferred.reject(reason);
                                process.nextTick(done);
                            });

                            it('should not produce any records', function() {
                                expect(watchmanStream.produce).not.toHaveBeenCalled();
                            });

                        });

                        describe('when beeswax middleware succeeds', function() {
                            var produceDeferred;

                            beforeEach(function(done) {
                                expect(postPlacementDeffereds.length).toBe(1);

                                watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);
                                initShowcaseDeferred.resolve({
                                    campaign : campaign,
                                    placements : placements
                                });

                                process.nextTick(done);
                            });

                            it('should produce a initializedShowcaseCampaign record', function() {
                                expect(watchmanStream.produce.calls.count()).toBe(1, 'Incorrect number of records produced!');
                                expect(watchmanStream.produce).toHaveBeenCalledWith({
                                    type: 'initializedShowcaseCampaign',
                                    data: {
                                        campaign: campaign,
                                        placements: placements,
                                        date: data.date
                                    }
                                });
                            });

                            describe('if producing the record fails', function() {
                                var reason;

                                beforeEach(function(done) {
                                    reason = new Error('I failed you...');
                                    produceDeferred.reject(reason);
                                    process.nextTick(done);
                                });

                                it('should log an error', function() {
                                    expect(log.error).toHaveBeenCalled();
                                });

                                it('should fulfill with undefined', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });

                            describe('when the record has been produced', function() {
                                beforeEach(function(done) {
                                    produceDeferred.fulfill(watchmanStream.produce.calls.mostRecent().args[0]);
                                    process.nextTick(done);
                                });

                                it('should not log an error', function() {
                                    expect(log.error).not.toHaveBeenCalled();
                                });

                                it('should fulfill with undefined', function() {
                                    expect(success).toHaveBeenCalledWith(undefined);
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
