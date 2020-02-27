import {Aws, Construct, Stack, StackProps} from "@aws-cdk/core";
import {Code, Function, IFunction, Runtime} from "@aws-cdk/aws-lambda";
import {SqsEventSource} from "@aws-cdk/aws-lambda-event-sources";
import {Effect, PolicyStatement, ServicePrincipal} from "@aws-cdk/aws-iam";
import {IQueue, Queue} from "@aws-cdk/aws-sqs";
import {ITopic, Topic} from "@aws-cdk/aws-sns";
import {IStateMachine, StateMachine} from "@aws-cdk/aws-stepfunctions";
import {SqsSubscription} from "@aws-cdk/aws-sns-subscriptions";

export interface IngestS3Props extends StackProps {
    bucketNameRegex: string,
    suffix?: string,
    prefix?: string,
    lambdaTarget: LambdaTarget,
    resourceBasename: string
}

export class IngestS3 extends Construct {
    private scope: Construct;
    private queue: IQueue;
    public topic: ITopic;
    private lambda: IFunction;

    constructor(scope: Construct, id: string, props: IngestS3Props) {
        super(scope, id);

        this.scope = scope;
        this.addTrigger(props);
    }

    public addTrigger(props: IngestS3Props): void {
        this.queue = new Queue(this, `${this.node.id}-sqs`, {queueName: `${props.resourceBasename}-sqs`});
        this.topic = new Topic(this, `${this.node.id}-sns`, {topicName: `${props.resourceBasename}-sns`});
        this.topic.addSubscription(new SqsSubscription(this.queue));
        this.topic.addToResourcePolicy(new PolicyStatement({
            principals: [ new ServicePrincipal("s3.amazonaws.com")],
            effect: Effect.ALLOW,
            actions: ["sns:Publish"],
            resources: [this.topic.topicArn],
            conditions: {StringLike: {"aws:SourceArn": `arn:aws:s3:::${props.bucketNameRegex}`}}
        }));
        this.lambda = new Function(
            this, `${this.node.id}-lambda`,
            {
                functionName: `${props.resourceBasename}-lambda`,
                code: Code.fromAsset('lambda_s3_trigger'),
                handler: "lambda_s3_trigger.lambda_handler",
                runtime: Runtime.PYTHON_3_7,
                environment: { TARGET_ARN: props.lambdaTarget.getTargetArn() }
            }
        );
        this.lambda.addEventSource(new SqsEventSource(this.queue));
        props.lambdaTarget.grantStartPermissionToLambda(this, this.lambda);
    }
}


export abstract class LambdaTarget {
    protected targetArn: string;

    protected constructor() {
    }

    abstract grantStartPermissionToLambda(scope: Construct, lambdaFunction: IFunction): void;
    abstract getTargetArn(): string;
}

export class LambdaTargetStateMachine extends LambdaTarget {
    private stateMachine: IStateMachine;
    private readonly stateMachineName: string;

    constructor(stateMachineName: string) {
        super();
        this.stateMachineName = stateMachineName;
    }

    public getTargetArn(): string {
        return `arn:aws:states:${Aws.REGION}:${Aws.ACCOUNT_ID}:stateMachine:${this.stateMachineName}`;
    }

    grantStartPermissionToLambda(stack: Stack, lambdaFunction: IFunction): void {
        this.stateMachine = StateMachine.fromStateMachineArn(stack, `${this.stateMachineName}-ingest-s3`, `arn:aws:states:${Aws.REGION}:${Aws.ACCOUNT_ID}:stateMachine:${this.stateMachineName}`);
        this.stateMachine.grantStartExecution(lambdaFunction);
    }
}

export class LambdaTargetLambda extends LambdaTarget {
    private lambdaFunction: IFunction;
    private readonly lambdaFunctionName: string;

    constructor(lambdaFunctionName: string) {
        super();
        this.lambdaFunctionName = lambdaFunctionName;
    }

    public getTargetArn(): string {
        return `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${this.lambdaFunctionName}`;
    }

    grantStartPermissionToLambda(scope: Construct, lambdaFunction: IFunction): void {
        this.lambdaFunction = Function.fromFunctionArn(scope, `${this.lambdaFunctionName}-ingest-s3`, `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${this.lambdaFunctionName}`);
        this.lambdaFunction.grantInvoke(lambdaFunction);
    }
}