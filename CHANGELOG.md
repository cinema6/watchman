# Watchman

* *[v0.1.0-rc1]*
  * [FEATURE]: Added campaign_email action to send out emails about campaign events

## v0.0.2 (March 22, 2016)
* *[v0.0.2-rc1]*
  * Improved shutdown behavior for when a worker becomes a zombie or terminates
  * Fix for an issue where multiple instances of a given KCL application would not be able to start
* *[/v0.0.2-rc1]*

## v0.0.1 (March 7, 2016)
* *[v0.0.1-rc2]*
  * [FIX]: Fix for an issue that could cause watchman to silently fail if a java worker process was lost
  * [FEATURE]: Allow fetch_campaigns to request campaigns in chunks of specified size
  * Log more detailed warnings when a request fails
  * Log the successful completion of actions at the trace level
* *[/v0.0.1-rc2]*

* *[v0.0.1-rc1]*
  * Initial release of Watchman
* *[/v0.0.1-rc1]*
