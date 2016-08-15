'use strict';

const ChartComposer = require('../../../lib/ChartComposer.js');
const CwrxRequest = require('../../../lib/CwrxRequest.js');
const fs = require('fs');
const appsChart = require('../../charts/apps.chart.js');
const handlebars = require('handlebars');
const htmlToText = require('html-to-text');
const ld = require('lodash');
const logger = require('cwrx/lib/logger.js');
const moment = require('moment');
const nodemailer = require('nodemailer');
const path = require('path');
const postmark = require('postmark');
const requestUtils = require('cwrx/lib/requestUtils.js');
const sesTransport = require('nodemailer-ses-transport');
const resolveURL = require('url').resolve;
const url = require('url');
const enums = require('cwrx/lib/enums.js');

module.exports = function factory(config) {
    const emailConfig = config.emails;
    const postmarkClient = new postmark.Client(config.state.secrets.postmark.key);
    const cwrxRequest = new CwrxRequest(config.appCreds);
    const showcaseAnalyticsEndpoint = url.resolve(config.cwrx.api.root,
        `${config.cwrx.api.analytics.endpoint}/campaigns/showcase/apps`);
    const chartComposer = new ChartComposer();
    const campaignsEndpoint = url.resolve(config.cwrx.api.root,
        config.cwrx.api.campaigns.endpoint);
    const releventStatuses = ld.values(enums.Status)
        .filter(value => value !== enums.Status.Canceled && value !== enums.Status.Deleted);
    const log = logger.getLog();

    function friendlyName(data) {
        return (data && data.user && data.user.firstName) ? `${data.user.firstName}, ` : '';
    }

    function campaignName(data) {
        return data && data.campaign && data.campaign.name;
    }

    function getAttachments(data) {
        const target = data.target || (data.campaign && data.campaign.application);
        switch(target) {
        case 'showcase':
            return [
                { filename: 'rc-apps-logo-white-text.png', cid: 'reelContentLogoWhite' },
                { filename: 'facebook-round-icon.png', cid: 'facebookRoundIcon' },
                { filename: 'twitter-round-icon.png', cid: 'twitterRoundIcon' },
                { filename: 'linkedin-round-icon.png', cid: 'linkedinRoundIcon' },
                { filename: 'website-round-icon.png', cid: 'websiteRoundIcon' }
            ];
        default:
            return [
                { filename: 'logo.png', cid: 'reelContentLogo' }
            ];
        }
    }

    /**
    * Schema representing the possible transactional emails that can be sent out using this action.
    * Each key value may be a function in which case its return value will be assigned to the key.
    * The function may optionally also return a promise.
    */
    const transactionalEmails = {
        campaignExpired: data => ({
            subject: 'Your Campaign Has Ended',
            template: 'campaignExpired',
            data: {
                campName       : data.campaign.name,
                date           : moment(new Date(data.date)).format('dddd, MMMM DD, YYYY'),
                dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                manageLink     : emailConfig.manageLink.replace(':campId', data.campaign.id)
            },
            attachments: getAttachments(data)
        }),
        campaignReachedBudget: data => ({
            subject: 'Your Campaign is Out of Budget',
            template: 'campaignOutOfBudget',
            data: {
                campName       : data.campaign.name,
                date           : moment(new Date(data.date)).format('dddd, MMMM DD, YYYY'),
                dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                manageLink     : emailConfig.manageLink.replace(':campId', data.campaign.id)
            },
            attachments: getAttachments(data)
        }),
        campaignApproved: data => ({
            subject: 'Reelcontent Campaign Approved',
            template: 'campaignApproved',
            data: {
                campName       : data.campaign.name,
                dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie']
            },
            attachments: getAttachments(data)
        }),
        campaignUpdateApproved: data => ({
            subject: 'Your Campaign Change Request Has Been Approved',
            template: 'campaignUpdateApproved',
            data: {
                campName       : data.campaign.name,
                dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie']
            },
            attachments: getAttachments(data)
        }),
        campaignRejected: data => ({
            subject: 'Reelcontent Campaign Rejected',
            template: 'campaignRejected',
            data: {
                campName         : data.campaign.name,
                dashboardLink    : emailConfig.dashboardLinks[data.target || 'selfie'],
                rejectionReason  : data.updateRequest.rejectionReason
            },
            attachments: getAttachments(data)
        }),
        campaignUpdateRejected: data => ({
            subject: 'Your Campaign Change Request Has Been Rejected',
            template: 'campaignUpdateRejected',
            data: {
                campName         : data.campaign.name,
                dashboardLink    : emailConfig.dashboardLinks[data.target || 'selfie'],
                rejectionReason  : data.updateRequest.rejectionReason
            },
            attachments: getAttachments(data)
        }),
        newUpdateRequest: data => {
            let submitter = null;

            if (data.user) {
                submitter = data.user.company || `${data.user.firstName} ${data.user.lastName}`;
            } else if (data.application) {
                submitter = data.application.key;
            }

            return {
                subject: `New update request from ${submitter} for campaign ` +
                    `"${campaignName(data)}"`,
                template: 'newUpdateRequest',
                data: {
                    requester   : (data.user && data.user.email) ||
                                    (data.application && data.application.key),
                    campName    : data.campaign.name,
                    reviewLink  : emailConfig.reviewLink.replace(':campId', data.campaign.id),
                    user: data.user,
                    application: data.application
                },
                attachments: getAttachments(data)
            };
        },
        paymentMade: data => {
            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'paymentReceipt--app';
                default:
                    return 'paymentReceipt';
                }
            }

            return {
                subject: 'Your payment has been approved',
                template: getTemplate(),
                data: {
                    contact         : emailConfig.supportAddress,
                    amount          : `\$${data.payment.amount.toFixed(2)}`,
                    isCreditCard    : data.payment.method.type === 'creditCard',
                    method          : data.payment.method,
                    date            : moment(new Date(data.payment.createdAt))
                                        .format('dddd, MMMM DD, YYYY'),
                    balance         : `\$${data.balance.toFixed(2)}`,
                    firstName       : data.user.firstName,
                    billingEndDate  : moment(new Date(data.payment.createdAt)).add(1, 'month')
                                        .subtract(1, 'day').format('dddd, MMMM DD, YYYY')
                },
                attachments: getAttachments(data)
            };
        },
        activateAccount: data => {
            function getSubject() {
                switch (data.target) {
                case 'showcase':
                    return `${friendlyName(data)}Welcome to Reelcontent Apps`;
                default:
                    return `${friendlyName(data)}Welcome to Reelcontent`;
                }
            }
            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'activateAccount--app';
                default:
                    return 'activateAccount';
                }
            }
            function getLink() {
                const target = emailConfig.activationTargets[data.target || 'selfie'];
                const link = `${target}${(target.indexOf('?') === -1) ? '?' : '&'}` +
                    `id=${data.user.id}&token=${data.token}`;
                return link;
            }

            return {
                subject: getSubject(),
                template: getTemplate(),
                data: {
                    activationLink  : getLink(),
                    firstName       : data.user.firstName
                },
                attachments: getAttachments(data)
            };
        },
        accountWasActivated: data => {
            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'accountWasActivated--app';
                default:
                    return 'accountWasActivated';
                }
            }

            return {
                subject: `${friendlyName(data)}Your Reelcontent Account Is Ready To Go`,
                template: getTemplate(),
                data: {
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    firstName      : data.user.firstName
                },
                attachments: getAttachments(data)
            };
        },
        passwordChanged: data => {
            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'passwordChanged--app';
                default:
                    return 'passwordChanged';
                }
            }

            return {
                subject: 'Reelcontent Password Change Notice',
                template: getTemplate(),
                data: {
                    contact        : emailConfig.supportAddress,
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    date           : moment(new Date(data.date)).format('dddd, MMMM DD, YYYY'),
                    firstName      : data.user.firstName,
                    time           : new Date(data.date).toTimeString()
                },
                attachments: getAttachments(data)
            };
        },
        emailChanged: data => {
            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'emailChanged--app';
                default:
                    return 'emailChanged';
                }
            }

            return {
                subject: 'Your Email Has Been Changed',
                template: getTemplate(),
                data: {
                    contact    : emailConfig.supportAddress,
                    newEmail   : data.newEmail,
                    oldEmail   : data.oldEmail,
                    firstName  : data.user.firstName
                },
                attachments: getAttachments(data)
            };
        },
        failedLogins: data => {
            const resetPasswordLink = emailConfig.passwordResetPages[data.target];

            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'failedLogins--app';
                default:
                    return 'failedLogins';
                }
            }

            return {
                subject: 'Reelcontent: Multiple-Failed Logins',
                template: getTemplate(),
                data: {
                    contact    : emailConfig.supportAddress,
                    firstName  : data.user.firstName,
                    link       : resetPasswordLink
                },
                attachments: getAttachments(data)
            };
        },
        forgotPassword: data => {
            const forgotTarget = emailConfig.forgotTargets[data.target];
            const resetLink = `${forgotTarget}${(forgotTarget.indexOf('?') === -1) ? '?' : '&'}` +
                `id=${data.user.id}&token=${data.token}`;

            function getTemplate() {
                switch (data.target) {
                case 'showcase':
                    return 'passwordReset--app';
                default:
                    return 'passwordReset';
                }
            }

            return {
                subject: 'Forgot Your Password?',
                template: getTemplate(),
                data: {
                    firstName  : data.user.firstName,
                    resetLink  : resetLink
                },
                attachments: getAttachments(data)
            };
        },
        chargePaymentPlanFailure: data => ({
            subject: 'We Hit a Snag',
            template: 'chargePaymentPlanFailure',
            data: {
                contact      : emailConfig.supportAddress,
                amount       : `\$${data.paymentPlan.price}`,
                cardType     : data.paymentMethod.cardType,
                cardLast4    : data.paymentMethod.last4,
                paypalEmail  : data.paymentMethod.email
            },
            attachments: getAttachments(data)
        }),
        campaignActive: data => {
            function getTemplate() {
                switch (data.campaign.application) {
                case 'showcase':
                    return 'campaignActive--app';
                default:
                    return 'campaignActive';
                }
            }
            function getExtraAttachments() {
                switch (data.campaign.application) {
                case 'showcase':
                    return [{
                        filename: 'plant-success.png',
                        cid: 'plantSuccess'
                    }];
                default:
                    return [];
                }
            }

            return {
                subject: `${campaignName(data)} Is Now Live!`,
                template: getTemplate(),
                data: {
                    campName       : data.campaign.name,
                    dashboardLink  : emailConfig.dashboardLinks[data.target || 'selfie'],
                    firstName      : data.user.firstName
                },
                attachments: getAttachments(data).concat(getExtraAttachments())
            };
        },
        campaignSubmitted: data => ({
            subject: `We\'ve Got It! ${campaignName(data)} Has Been Submitted for Approval.`,
            template: 'campaignSubmitted',
            data: {
                campName     : data.campaign.name,
                firstName    : data.user.firstName,
                previewLink  : emailConfig.previewLink.replace(':campId', data.campaign.id)
            },
            attachments: getAttachments(data)
        }),
        initializedShowcaseCampaign: data => {
            return Promise.resolve().then(() => {
                const advertisersEndpoint = resolveURL(
                    config.cwrx.api.root,
                    config.cwrx.api.advertisers.endpoint
                );
                const campaign = data.campaign;
                const externalCampaignId = ld.get(
                    campaign,'externalIds.beeswax',
                    ld.get(campaign,'externalCampaigns.beeswax.externalId')
                );

                return requestUtils.makeSignedRequest(config.appCreds, 'get', {
                    url: `${advertisersEndpoint}/${campaign.advertiserId}`,
                    json: true
                }).then(data => {
                    const response = data.response;
                    const externalAdvertiserId = ld.get(
                        data.body,'externalIds.beeswax',
                        ld.get(data.body,'beeswaxIds.advertiser')
                    );

                    if (!/^2/.test(response.statusCode)) {
                        throw new Error(
                            `Failed to GET advertiser(${campaign.advertiserId}): ` +
                            `[${response.statusCode}]: data.body`
                        );
                    }

                    return {
                        subject: `New Showcase Campaign Started: ${campaignName(data)}`,
                        template: 'initializedShowcaseCampaign',
                        data: {
                            beeswaxCampaignId   : externalCampaignId,
                            beeswaxCampaignURI  : emailConfig.beeswax.campaignLink
                                .replace('{{advertiserId}}', externalAdvertiserId)
                                .replace('{{campaignId}}', externalCampaignId),
                            campName            : campaign.name
                        },
                        attachments: [
                            { filename: 'logo.png', cid: 'reelContentLogo' }
                        ]
                    };
                });
            });
        },
        promotionEnded: data => ({
            template: 'promotionEnded--app',
            data: {
                firstName     : data.user.firstName,
                dashboardLink : emailConfig.dashboardLinks.showcase
            },
            attachments: getAttachments({
                target: 'showcase'
            })
        }),
        stats: data => {
            return cwrxRequest.get({
                url: campaignsEndpoint,
                qs: {
                    application: 'showcase',
                    org: data.org.id,
                    statuses: releventStatuses.join(','),
                    sort: 'created,1'
                }
            }).then(ld.spread(campaigns => {
                return Promise.all(campaigns.map(campaign => {
                    return cwrxRequest.get(`${showcaseAnalyticsEndpoint}/${campaign.id}`);
                })).then(results => {
                    const stats = results.map(result => result[0].daily_7);

                    // Helper function to sum an array of Numbers
                    function sum(numbers) {
                        return numbers.reduce((lhs, rhs) => lhs + rhs, 0);
                    }

                    // Helper function to compute a percent
                    function toPercent(number) {
                        return Math.round(number * 100);
                    }

                    // Aggregate stats by day
                    const zippedStats = ld.spread(ld.zip)(stats);
                    const aggregateUsers = zippedStats.map(appStats => sum(appStats.map(appStat =>
                            appStat.users)));
                    const aggregateClicks = zippedStats.map(appStats => sum(appStats.map(appStat =>
                            appStat.clicks)));
                    const aggregateCtrs = aggregateUsers.map((users, index) => toPercent(Math.min(
                        aggregateClicks[index], users) / users) || null);
                    const labels = stats[0].map(stat => moment(stat.date));

                    // Compile chart.js options
                    const chart = appsChart({
                        items: zippedStats,
                        industryCTR: 1,
                        users: aggregateUsers,
                        ctrs: aggregateCtrs,
                        labels: labels
                    });

                    log.info(`Generating stats chart for org ${data.org.id}`);

                    // Compose the chart
                    return chartComposer.compose(chart, {
                        width: 640,
                        height: 480
                    }).then(chartImage => {
                        const chartData = chartImage.replace('data:image/png;base64,', '');

                        // Calculate start and end dates
                        const dateFormat = 'MMM D, YYYY';
                        const firstLabel = labels[0];
                        const lastLabel = labels[labels.length - 1];
                        const startDate = firstLabel.format(dateFormat);
                        const endDate = lastLabel.format(dateFormat);

                        // Calculate stats for each app
                        const apps = campaigns.map((campaign, index) => {
                            const users = stats[index].map(item => item.users);
                            const clicks = stats[index].map(item => item.clicks);
                            const totalUsers = sum(users);
                            const totalClicks = sum(clicks);
                            const totalCtr = Math.round(Math.min(
                                totalClicks, totalUsers) / totalUsers * 10000) / 100;

                            return {
                                name: campaign.name,
                                views: totalUsers,
                                clicks: totalClicks,
                                ctr: totalCtr
                            };
                        });

                        // Calculate total stats accross all apps
                        const totalUsers = sum(aggregateUsers);
                        const totalClicks = sum(aggregateClicks);
                        const totalCtr = Math.round(Math.min(
                            totalClicks, totalUsers) / totalUsers * 10000) / 100;

                        return {
                            template: 'weekOneStats--app',
                            data: {
                                firstName: data.user.firstName,
                                dashboardLink: emailConfig.dashboardLinks.showcase,
                                startDate: startDate,
                                endDate: endDate,
                                apps: apps,
                                totalViews: totalUsers,
                                totalClicks: totalClicks,
                                totalCtr: totalCtr
                            },
                            attachments: getAttachments({
                                target: 'showcase'
                            }).concat([{
                                filename: `stats_week_${data.week}.png`,
                                cid: 'stats',
                                content: chartData
                            }])
                        };
                    });
                });
            }));
        }
    };

    /* The action function */
    return event => {
        const data = event.data;
        const options = event.options;
        const emailType = options.type;
        const provider = options.provider || 'postmark';

        /**
        * Gets the recipient of the email. If the "toSupport" option is true, the recipient will be
        * the configured address of support Otherwise, if the "to" option is specified, its value
        * will be the recipient. Otherwise if there is a user that was provided as data, the email
        * on the user is the recipient. Otherwise if there is a campaign that was provided as data,
        * the owner of the campaign is considered to be the recipient.
        */
        function getRecipient(data, options) {
            const log = logger.getLog();
            return Promise.resolve().then(() => {
                if(options.toSupport) {
                    return config.emails.supportAddress;
                } else if(options.to) {
                    const compiledRecipient = handlebars.compile(options.to);
                    return compiledRecipient(data);
                } else if(data.user && data.user.email) {
                    return data.user.email;
                } else if(data.campaign && data.campaign.user) {
                    const apiRoot = config.cwrx.api.root;
                    const appCreds = config.appCreds;
                    const userId = data.campaign.user;
                    const userEndpoint = apiRoot + config.cwrx.api.users.endpoint + '/' + userId;
                    return requestUtils.makeSignedRequest(appCreds, 'get', {
                        fields: 'email,firstName',
                        json: true,
                        url: userEndpoint
                    }).then(response => {
                        const statusCode = response.response.statusCode;
                        const body = response.body;
                        if(statusCode === 200) {
                            ld.set(data, 'user', body);
                            return body.email;
                        } else {
                            log.warn(`Error requesting user ${userId}, code: ${statusCode} ` +
                                `body: ${body}`);
                            return Promise.reject('Error requesting user');
                        }
                    });
                } else if (data.org) {
                    return requestUtils.makeSignedRequest(config.appCreds, 'get', {
                        qs: { fields: 'email,firstName', org: data.org.id, sort: 'created,1' },
                        url: resolveURL(config.cwrx.api.root, config.cwrx.api.users.endpoint)
                    }).then(result => {
                        const response = result.response;
                        const body = result.body;

                        if (response.statusCode !== 200) {
                            throw new Error(`Failed to get users for org ${data.org.id}: ${body}`);
                        }

                        ld.set(data, 'user', body[0]);
                        return body[0].email;
                    });
                } else {
                    return Promise.reject('Could not find a recipient');
                }
            });
        }

        /* Knows how to send a transactional emails using ses. */
        function sesAdapter(email) {
            const sesEmail = ld.pick(email, ['to', 'from', 'subject']);
            const templatePath = path.join(__dirname, '../../../templates',
                `${email.template}.html`);

            return new Promise((resolve, reject) => {
                fs.readFile(templatePath, {
                    encoding: 'utf8'
                }, (error, data) => {
                    if(error) {
                        reject(error);
                    } else {
                        resolve(data);
                    }
                });
            }).then(fileContents => {
                const compiledTemplate = handlebars.compile(fileContents);
                const html = compiledTemplate(email.data);
                let text = htmlToText.fromString(html);
                const capsLinks = text.match(/\[HTTPS?:\/\/[^\]]+\]/g);
                (capsLinks || []).forEach(link => {
                    text = text.replace(link, link.toLowerCase());
                });

                sesEmail.html = html;
                sesEmail.text = text;
                sesEmail.attachments = email.attachments;
                sesEmail.attachments.forEach(attachment => {
                    attachment.path = path.join(__dirname, '../../../templates/assets',
                        attachment.filename);
                });

                return new Promise((resolve, reject) => {
                    const transport = nodemailer.createTransport(sesTransport());
                    transport.sendMail(sesEmail, error => {
                        if(error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        }

        /* Knows how to send a transaction emails using postmark. */
        function postmarkAdapter(email) {
            const template = email.template;

            return Promise.all(email.attachments.map(attachment => {
                const getContent = () => {
                    return new Promise((resolve, reject) => {
                        const assetPath = path.join(__dirname, '../../../templates/assets',
                            attachment.filename);
                        fs.readFile(assetPath, {
                            encoding: 'base64'
                        }, (error, data) => {
                            if(error) {
                                reject(error);
                            } else {
                                resolve(data);
                            }
                        });
                    });
                };
                return ('content' in attachment) ? attachment.content : getContent();
            })).then(files => {
                return new Promise((resolve, reject) => {
                    return postmarkClient.sendEmailWithTemplate({
                        TemplateId: config.postmark.templates[template],
                        TemplateModel: email.data,
                        InlineCss: true,
                        From: email.from,
                        To: email.to,
                        Tag: template,
                        TrackOpens: true,
                        Attachments: email.attachments.map((attachment, index) => {
                            return {
                                Name: attachment.filename,
                                Content: files[index],
                                ContentType: 'image/png',
                                ContentID: 'cid:' + attachment.cid
                            };
                        })
                    }, (error, response) => {
                        if(error) {
                            reject(error);
                        } else {
                            resolve(response);
                        }
                    });
                });
            });
        }

        if(!emailType || !transactionalEmails[emailType]) {
            return Promise.reject('Must specify a valid email type');
        }

        return getRecipient(data, options).then(recipient => {
            const optionsFactory = transactionalEmails[emailType];

            return Promise.resolve(optionsFactory(data)).then(email => {
                email.to = recipient;
                email.from = emailConfig.sender;

                switch(provider) {
                case 'ses':
                    return sesAdapter(email);
                case 'postmark':
                    return postmarkAdapter(email);
                default:
                    throw new Error(`Unrecognized provider ${provider}`);
                }
            });
        });
    };
};
