import {Aws, Construct, Stack, StackProps} from "@aws-cdk/core";
import {Code, Function, IFunction, Runtime} from "@aws-cdk/aws-lambda";
import {SqsEventSource} from "@aws-cdk/aws-lambda-event-sources";
import {Bucket} from "@aws-cdk/aws-s3";
import {Effect, PolicyStatement, ServicePrincipal} from "@aws-cdk/aws-iam";
import {IQueue, Queue} from "@aws-cdk/aws-sqs";
import {ITopic, Topic} from "@aws-cdk/aws-sns";
import {IStateMachine, StateMachine} from "@aws-cdk/aws-stepfunctions";
import snsSubscriptions = require('@aws-cdk/aws-sns-subscriptions');

export interface Trigger {
    suffix?: string,
    prefix?: string,
    lambdaTarget: LambdaTarget,
    queue?: IQueue,
    topic?: Topic,
    lambda?: IFunction
}

interface TriggerList extends Array<Trigger> {
}

interface IngestS3StackProps extends StackProps {
    resourceBaseName: string,
    bucketNameRegex: string
}

export class IngestS3 extends Stack {
    private bucket: Bucket;
    private scope: Construct;
    private id: string;
    private props: IngestS3StackProps;

    constructor(scope: Construct, id: string, props: IngestS3StackProps) {
        super(scope, id, props);
        this.scope = scope;
        this.props = props;
    }

    public addTrigger(trigger: Trigger): ITopic {
        trigger.queue = new Queue(this, `${this.node.id}-sqs`, {queueName: `${this.props.resourceBaseName}-sqs`});
        trigger.topic = new Topic(this, `${this.node.id}-sns`, {topicName: `${this.props.resourceBaseName}-sns`});
        trigger.topic.addSubscription(new snsSubscriptions.SqsSubscription(trigger.queue));
        trigger.topic.addToResourcePolicy(new PolicyStatement({
            principals: [ new ServicePrincipal("s3.amazonaws.com")],
            effect: Effect.ALLOW,
            actions: ["sns:Publish"],
            resources: [trigger.topic.topicArn],
            conditions: {StringLike: {"aws:SourceArn": `arn:aws:s3:::${this.props.bucketNameRegex}`}}
        }));
        trigger.lambda = new Function(
            this, `${this.node.id}-lambda`,
            {
                functionName: `${this.props.resourceBaseName}-lambda`,
                code: Code.fromAsset('lambda_s3_trigger'),
                handler: "lambda_s3_trigger.lambda_handler",
                runtime: Runtime.PYTHON_3_7,
            }
        );
        // this.bucket.grantReadWrite(trigger.lambda);
        trigger.lambda.addEventSource(new SqsEventSource(trigger.queue));
        trigger.lambdaTarget.grantStartPermissionToLambda(this, trigger.lambda);

        return trigger.topic;

        // this.bucket.addEventNotification(EventType.OBJECT_CREATED, new SnsDestination(trigger.topic), {
        //     prefix: trigger.prefix ? trigger.prefix : undefined,
        //     suffix: trigger.suffix ? trigger.suffix : undefined
        // })
    }
}


export abstract class LambdaTarget {
    protected targetArn: string;

    protected constructor() {
    }

    abstract grantStartPermissionToLambda(scope: Construct, lambdaFunction: IFunction): void;
}

export class LambdaTargetStateMachine extends LambdaTarget {
    private stateMachine: IStateMachine;
    private stateMachineName: string;

    constructor(stateMachineName: string) {
        super();
        this.stateMachineName = stateMachineName;
    }

    grantStartPermissionToLambda(stack: Stack, lambdaFunction: IFunction): void {
        this.stateMachine = StateMachine.fromStateMachineArn(stack, `${this.stateMachineName}-ingest-s3`, `arn:aws:states:${Aws.REGION}:${Aws.ACCOUNT_ID}:stateMachine:${this.stateMachineName}`);
        this.stateMachine.grantStartExecution(lambdaFunction);
    }
}

export class LambdaTargetLambda extends LambdaTarget {
    private lambdaFunction: IFunction;
    private lambdaFunctionName: string;

    constructor(lambdaFunctionName: string) {
        super();
        this.lambdaFunctionName = lambdaFunctionName;
    }

    grantStartPermissionToLambda(scope: Construct, lambdaFunction: IFunction): void {
        this.lambdaFunction = Function.fromFunctionArn(scope, `${this.lambdaFunctionName}-ingest-s3`, `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${this.lambdaFunctionName}`);
        this.lambdaFunction.grantInvoke(lambdaFunction);
    }
}