/* jshint camelcase: false */
'use strict';

fdescribe('(action factory) showcase/apps/init_campaign', function() {
    var q, uuid, resolveURL, ld, logger, showcaseFactories;
    var JsonProducer, CwrxRequest, BeeswaxClient;
    var factory;

    beforeAll(function() {
        jasmine.clock().install();
        jasmine.clock().mockDate(new Date(1453929767464)); //Wed Jan 27 2016 16:22:47 GMT-0500 (EST)
        q = require('q');
        uuid = require('rc-uuid');
        resolveURL = require('url').resolve;
        ld = require('lodash');
        logger = require('cwrx/lib/logger');
        showcaseFactories = require('showcase-core').factories;

        delete require.cache[require.resolve('rc-kinesis')];
        JsonProducer = (function(JsonProducer) {
            return jasmine.createSpy('JsonProducer()').and.callFake(function(name, options) {
                var producer = new JsonProducer(name, options);

                spyOn(producer, 'produce').and.returnValue(q.defer().promise);

                return producer;
            });
        }(require('rc-kinesis').JsonProducer));
        require.cache[require.resolve('rc-kinesis')].exports.JsonProducer = JsonProducer;

        delete require.cache[require.resolve('../../lib/CwrxRequest')];
        CwrxRequest = (function(CwrxRequest) {
            return jasmine.createSpy('CwrxRequest()').and.callFake(function(creds) {
                var request = new CwrxRequest(creds);

                spyOn(request, 'send').and.returnValue(q.defer().promise);

                return request;
            });
        }(require('../../lib/CwrxRequest')));
        require.cache[require.resolve('../../lib/CwrxRequest')].exports = CwrxRequest;

        delete require.cache[require.resolve('beeswax-client')];
        BeeswaxClient = (function(BeeswaxClient) {
            return jasmine.createSpy('BeeswaxClient()').and.callFake(function(creds) {
                var beeswax = new BeeswaxClient(creds);
                return beeswax;
            });
        }(require('beeswax-client')));
        require.cache[require.resolve('beeswax-client')].exports = BeeswaxClient;
        
        delete require.cache[require.resolve('../../src/actions/showcase/apps/init_campaign')];
        factory = require('../../src/actions/showcase/apps/init_campaign');
    });

    afterAll(function() {
        jasmine.clock().uninstall();
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
                beeswax : {
                    api: {
                        root: 'http://33.33.33.10/'
                    },
                    creds : {
                        email : 'bu@g.z',
                        password : 'x'
                    }
                },
                cwrx: {
                    api: {
                        root: 'http://33.33.33.10/',
                        placements: {
                            endpoint: '/api/placements'
                        },
                        campaigns: {
                            endpoint: '/api/campaigns'
                        },
                        advertisers: {
                            endpoint: '/api/account/advertisers'
                        }
                    }
                },
                kinesis: {
                    producer: {
                        region: 'us-east-1',
                        stream: 'devWatchmanStream'
                    }
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
            beeswax = BeeswaxClient.calls.mostRecent().returnValue;
            watchmanStream = JsonProducer.calls.mostRecent().returnValue;
        });

        it('should return the action Function', function() {
            expect(initCampaign).toEqual(jasmine.any(Function));
            expect(initCampaign.name).toBe('initCampaign');
        });

        it('should create a CwrxRequest', function() {
            expect(CwrxRequest).toHaveBeenCalledWith(config.appCreds);
        });

        it('should create a BeeswaxClient', function() {
            expect(BeeswaxClient).toHaveBeenCalledWith({ 
                apiRoot : config.beeswax.api.root, creds : config.beeswax.creds 
            });
        });

        it('should create a JsonProducer', function() {
            expect(JsonProducer).toHaveBeenCalledWith(config.kinesis.producer.stream, config.kinesis.producer);
        });

        describe('the action', function() {
            var data, options, event, advertiser;
            var getAdvertiserDeferred, putAdvertiserDeferred,
                postPlacementDeferred, bwCreateAdvertiserDeferred, bwCreateCampaignDeferred;
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
                
                advertiser = {
                    id : data.campaign.advertiserId,
                    name : 'ACME TNT',
                    externalIds : { beeswax : 1 }
                };

                success = jasmine.createSpy('success()');
                failure = jasmine.createSpy('failure()');
                getAdvertiserDeferred =
                    putAdvertiserDeferred =
                    postPlacementDeferred =
                    bwCreateAdvertiserDeferred =
                    bwCreateCampaignDeferred = undefined;
                
                spyOn(request, 'get').and.callFake(function(opts){
                    if(opts.url.match(/\/api\/account\/advertisers/)){
                        return (getAdvertiserDeferred = q.defer()).promise;
                    }
                    return q.reject('Unexpected GET');
                });
                
                spyOn(request, 'post').and.callFake(function(opts){
                    if(opts.url.match(/\/api\/placements/)){
                        return (postPlacementDeferred = q.defer()).promise;
                    }
                    return q.reject('Unexpected GET');
                });

                initCampaign(event).then(success, failure);
                process.nextTick(done);
            });
           
            describe('ensuring the advertiser', function(){
                beforeEach(function(){
                    delete advertiser.externalIds;
                    spyOn(request, 'put').and.callFake(function(opts){
                        if(opts.url.match(/\/api\/account\/advertisers/)){
                            return (putAdvertiserDeferred = q.defer()).promise;
                        }
                        return q.reject('Unexpected PUT');
                    });
                    spyOn(beeswax.advertisers,'create')
                        .and.returnValue((bwCreateAdvertiserDeferred = q.defer()).promise);

                });

                describe('with no beeswax ids',function(){
                    var updatedAdvert;
                    beforeEach(function(done){
                        bwCreateAdvertiserDeferred.resolve({ payload : {advertiser_id:1}});
                        getAdvertiserDeferred.resolve([advertiser]);
                        process.nextTick(done);
                    });

                    beforeEach(function(done){
                        ld.assign(updatedAdvert,advertiser,{ externalIds: { beeswax : 1 }});
                        putAdvertiserDeferred.resolve([updatedAdvert]);
                        process.nextTick(done);
                    });

                    it('will attempt to create a beeswax advertiser',function(){
                        expect(beeswax.advertisers.create).toHaveBeenCalledWith({
                            advertiser_name : advertiser.name,
                            alternative_id : advertiser.id,
                            notes : 'Created by Showcase Apps Init Campaign.',
                            active : true
                        });
                    });

                    it('will attempt to update the rc advertiser',function(){
                        expect(request.put).toHaveBeenCalledWith({
                            url : 'http://33.33.33.10/api/account/advertisers/' +
                                advertiser.id,
                            json : { externalIds : { beeswax : 1 } }
                        });
                    });

                });
                
                describe('with old beeswax id structure',function(){
                    var updatedAdvert;
                    beforeEach(function(done){
                        advertiser.beeswaxIds = { advertiser : 2 };
                        getAdvertiserDeferred.resolve([advertiser]);
                        process.nextTick(done);
                    });

                    beforeEach(function(done){
                        ld.assign(updatedAdvert,advertiser,{ externalIds: { beeswax : 1 }});
                        putAdvertiserDeferred.resolve([updatedAdvert]);
                        process.nextTick(done);
                    });

                    it('will not attempt to create a beeswax advertiser',function(){
                        expect(beeswax.advertisers.create).not.toHaveBeenCalled();
                    });

                    it('will attempt to update the rc advertiser',function(){
                        expect(request.put).toHaveBeenCalledWith({
                            url : 'http://33.33.33.10/api/account/advertisers/' +
                                advertiser.id,
                            json : { externalIds : { beeswax : 2 } }
                        });
                    });

                });

                describe('with current beeswax id structure',function(){
                    beforeEach(function(done){
                        advertiser.externalIds = { beeswax : 3 };
                        getAdvertiserDeferred.resolve([advertiser]);
                        process.nextTick(done);
                    });

                    beforeEach(function(done){
                        process.nextTick(done);
                    });

                    it('will not attempt to create a beeswax advertiser',function(){
                        expect(beeswax.advertisers.create).not.toHaveBeenCalled();
                    });

                    it('will not attempt to update the rc advertiser',function(){
                        expect(putAdvertiserDeferred).not.toBeDefined();
                    });

                });
            });

            describe('creating the beeswax campaign',function(){
                var putCampaignDeferred;
                beforeEach(function(done){
                    getAdvertiserDeferred.resolve([advertiser]);
                    spyOn(beeswax.campaigns,'create')
                        .and.returnValue((bwCreateCampaignDeferred = q.defer()).promise);
                    spyOn(request, 'put').and.returnValue(
                        (putCampaignDeferred = q.defer()).promise);
                    process.nextTick(done);
                });

                beforeEach(function(done){
                    bwCreateCampaignDeferred.resolve({ payload : { campaign_id : 5 } });
                    process.nextTick(done);
                });
                
                beforeEach(function(done){
                    putCampaignDeferred.fulfill([
                        { foo : 'bar', externalIds : { beeswax : 55 }},
                        { statusCode: 200 }
                    ]);
                    process.nextTick(done);
                });

                it('creates a beeswax campaign',function(){
                    expect(beeswax.campaigns.create).toHaveBeenCalledWith({
                        advertiser_id : 1,
                        alternative_id : data.campaign.id,
                        campaign_name : 'This is the Name of My Product',
                        start_date : '2016-01-27 00:00:00',
                        active : false
                    });
                });
            });

            describe('when the external campaign is created', function() {
                var putCampaignDeferred;
                
                beforeEach(function(done){
                    getAdvertiserDeferred.resolve([advertiser]);
                    spyOn(beeswax.campaigns,'create')
                        .and.returnValue((bwCreateCampaignDeferred = q.defer()).promise);
                    spyOn(request, 'put').and.returnValue(
                        (putCampaignDeferred = q.defer()).promise);
                    process.nextTick(done);
                });

                beforeEach(function(done){
                    bwCreateCampaignDeferred.resolve({ payload : { campaign_id : 5 } });
                    process.nextTick(done);
                });
                
                it('should add one card to the campaign', function() {
                    expect(request.put).toHaveBeenCalledWith({
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.campaigns.endpoint + '/' + data.campaign.id),
                        json: ld.assign({}, data.campaign, {
                            cards: data.campaign.cards.concat([
                                ld.assign(showcaseFactories.app.createInterstitialFactory(options.card.interstitial)(data.campaign.product), {
                                    user: data.campaign.user,
                                    org: data.campaign.org
                                })
                            ]),
                            externalIds : { beeswax : 5 }
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
                        expect(log.error).toHaveBeenCalledWith('Failed to initialize showcase (app) campaign(%1): %2',data.campaign.id,'[Error: I failed you...]');
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

                    it('should create one placements', function() {
                        expect(request.post.calls.count()).toBe(1, 'Wrong number of placements created!');

                        expect(request.post).toHaveBeenCalledWith({
                            url: resolveURL(config.cwrx.api.root, config.cwrx.api.placements.endpoint),
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

                    describe('when the placements have been created', function() {
                        var placements;
                        var produceDeferred;

                        beforeEach(function(done) {
                            expect(postPlacementDeffereds.length).toBe(1);

                            watchmanStream.produce.and.returnValue((produceDeferred = q.defer()).promise);

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
/* jshint camelcase: true */
