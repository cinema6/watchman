'use strict';

const Hubspot = require('../lib/Hubspot.js');

const SECRETS = JSON.parse(process.env.secrets);
const HUBSPOT_API_KEY = SECRETS.hubspot.key;

const hubspot = new Hubspot(HUBSPOT_API_KEY);

// Ensure there is no e2e contact in Hubspot
hubspot.getContactByEmail('c6e2etester@gmail.com').then(contact => {
    if(contact) {
        return hubspot.deleteContact(contact.vid);
    }
}).catch(error => {
    throw error;
});
