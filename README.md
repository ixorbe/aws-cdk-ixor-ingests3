# @ixor/aws-cdk-ixor-ingests3 module

This `aws-cdk` stack can be used create the following components:

```
+------+                                                               +---------------+
|      |   +-------IngestS3 Construct-----------------------------+    |               |
| File |   |                                                      |  +-> Step Function |
|      |   |                                                      |  | |               |
+--+---+   | +-----------+      +-----------+      +-----------+  |  | +---------------+
   |       | |           |      |           |      |           +-----+
   +---------> SNS Topic +------> SQS Queue +------>  Lambda   |  |    +---------------+
           | |           |      |           |      |           +-----+ |               |
           | +-----------+      +-----------+      +-----------+  |  +->    Lambda     |
           |                                                      |    |               |
           |                                                      |    +---------------+
           +------------------------------------------------------+
```

The construct is typically used in a stack where the S3 bucket that requires the trigger is created.

An example:

```TypeScript
import {Stack, StackProps, Construct} from "@aws-cdk/core";
import {Bucket, HttpMethods, BlockPublicAccess} from "@aws-cdk/aws-s3";
import {IngestS3, IngestS3Props, LambdaTargetStateMachine} from "@ixor/aws-cdk-ixor-ingests3";
import {SnsDestination} from "@aws-cdk/aws-s3-notifications";

export class S3Stack extends Stack {
    public bucket: Bucket;

    constructor(scope: Construct, id: string, props: S3StackProps) {
        super(scope, id, props);

        this.bucket = new Bucket(this, "myBucket", {bucketName: "myBucket"});

        let ingestS3 = new IngestS3(this, "myIngestS3"`, {
             bucketNameRegex: "myBuck*",
             lambdaTarget: new LambdaTargetStateMachine("myStateMachine"),
             resourceBasename: "myIngestS3"
         });

        this.bucket.addObjectCreatedNotification(new SnsDestination(ingestS3.topic), {
            suffix: props.suffix ?? undefined,
            prefix: props.prefix ?? undefined
        });
```