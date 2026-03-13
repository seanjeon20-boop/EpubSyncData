
const fs = require('fs');

async function testFetch() {
    try {
        // We can't easily access AsyncStorage from node.
        // But we can check if there are any books in the books folder.
        const files = fs.readdirSync('./books');
        console.log('Local books:', files);
        
        // Let's check the sync.json if it exists
        if (fs.existsSync('./data/sync.json')) {
            const sync = JSON.parse(fs.readFileSync('./data/sync.json', 'utf8'));
            console.log('Sync data keys:', Object.keys(sync.books));
        }
    } catch (e) {
        console.error(e);
    }
}

testFetch();
