import './lib/setup';
import { LogLevel, SapphireClient } from '@sapphire/framework';

const client = new SapphireClient({
	defaultPrefix: '!',
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug
	},
	shards: 'auto',
	intents: [
		'GUILDS',
		'GUILD_MEMBERS',
		'GUILD_BANS',
		'GUILD_EMOJIS_AND_STICKERS',
		'GUILD_VOICE_STATES',
		'GUILD_MESSAGES',
		'GUILD_MESSAGE_REACTIONS',
		'DIRECT_MESSAGES',
		'DIRECT_MESSAGE_REACTIONS'
	],
});

const main = async () => {
	try {
		client.logger.info('Logging in');
		await client.login();
		client.logger.info('logged in');
	} catch (error) {
		client.logger.fatal(error);
		client.destroy();
		process.exit(1);
	}
};

/**
 * Returns the config settings depending on the command line args.
 * Read command line args to know if prod, dev, or test and what server
 * First arg is one of prod, dev or test
 * the second is the test server, but the first one must be test
 * @param args 
 * @returns {Map} config settings
 */
/*  function getConfig(args: string[]): Map<string, any> {
    if (args.length >= 1) {
        if (args[0] === 'dev' && process.env.DEV) {
            // Default dev
            return JSON.parse(process.env.DEV);
        } else if (args[0] === 'prod') {
            // Production
            if (args[1] === 'yes' && process.env.PROD) {
                return JSON.parse(process.env.PROD);
            }
        } else if (args[0] === 'test' && process.env.TEST) {
            // Test
            const testConfig = JSON.parse(process.env.TEST);
            let server = args[1] ?? 0;
            if (server === '1') {
                return testConfig['ONE'];
            } else if (server === '2') {
                return testConfig['TWO'];
            } else if (server === '3') {
                return testConfig['THREE'];
            } else if (server === '4') {
                return testConfig['FOUR'];
            }
        }
    }
    
    // exit if no configs are loaded!
    console.log('No configs were found for given args.');
    process.exit(0);
} */

// const config = getConfig(process.argv.slice(2));
// const isLogToConsole = config.get('consoleLog') as boolean;

/* if (config.get('sentryLog')) {
    // Sentry.init({
    //     dsn: '',
      
    //     // Set tracesSampleRate to 1.0 to capture 100%
    //     // of transactions for performance monitoring.
    //     // We recommend adjusting this value in production
    //     tracesSampleRate: 0.25,
    // });
} */


main();
