# mssql-by-steve

Finally, a mssql wrapper for the rest of us

## Installation

```bash
npm install mssql-by-steve
``` 

## Usage
Create a new ts file, initialize SqlHelper 

Option 1: Initialize with configuration:
```javascript
import SqlHelper from 'mssql-by-steve';

SqlHelper.initialize({
    user: "your_username",
    password: "your_password",
    server: "your_server",
    database: "your_database"
});
```

Option 2: initialize using environment variables:
```javascript
import SqlHelper from 'mssql-by-steve';

SqlHelper.initializeFromEnv();
// Reads from: db_user, db_password, server, database
```

Export SqlHelper then import it from anywhere in your application and use it:
```javascript
import SqlHelper from 'path-to-your-initialization-file';
const result = await SqlHelper.executeSingle<string>(
    'Text',
    `SELECT SomeColumn FROM SomeTable WHERE SomeColumn = @someValue`,
    [
        {name: 'someValue', type: 'VarChar', value: 'SomeValue'}
    ]
);
```