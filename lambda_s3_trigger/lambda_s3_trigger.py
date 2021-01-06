import json
import logging
import os
import boto3
import http
import uuid


class InputError(Exception):

    def __init__(self, message):
        self.message = message


logger = logging.getLogger()
logger.setLevel(logging.INFO)

if "DEBUG" in os.environ:
    logger.setLevel(logging.DEBUG)


try:
    envvar_target_arn = os.getenv('TARGET_ARN')
    envvar_id = f"{os.getenv('ID', 'None')}"
except Exception:
    raise InputError("Environment variables TARGET_ARN and ID are required")


def lambda_handler(event, context):
    logger.info(f"Starting S3 Trigger Lambda")
    logger.debug(json.dumps(event))

    processed_events = 1
    return_body = []
    http_status_code = http.HTTPStatus.OK

    for record in event['Records']:
        if record['eventSource'] == 'aws:sqs':
            body = json.loads(record['body'])
            logger.info(json.dumps(body))

            if "Amazon S3 Notification" in body['Subject']:
                message = json.loads(body['Message'])
                logger.info(json.dumps(message))

                if "Event" in message.keys() and message["Event"] == "s3:TestEvent":
                    return {
                        "statusCode": http.HTTPStatus.OK,
                        "message": f"This is a S3 test event created when an event notification is created.",
                        "body": "{}"
                    }
                elif "Records" in message.keys():
                    for record in message['Records']:
                        if record['eventSource'] == 'aws:s3':
                            logger.info(f"### Processing event {processed_events} in this batch ###")
                            logger.debug("This is an S3 record:")
                            logger.debug(json.dumps(record))
                            s3_bucket = record['s3']['bucket']['name']
                            s3_key = record['s3']['object']['key']
                            s3_size = record['s3']['object']['size']
                            logger.info(f"Bucket: {s3_bucket}")
                            logger.info(f"ObjectKey: {s3_key}")
                            logger.info(f"ObjectSize: {s3_size}")

                            logger.info(f"Processing s3 event notification for {s3_bucket}/{s3_key}")
                            return_body.append({"bucket": s3_bucket, "key": s3_key})

                            if envvar_id == "":
                                correlation_id = f"{uuid.uuid4()}"
                            else:
                                correlation_id = f"{envvar_id}-{uuid.uuid4()}"

                            logger.info(f"Correlation ID: {correlation_id}")

                            if 'stateMachine' in envvar_target_arn:
                                client = boto3.client('stepfunctions')
                                sfn_return_body = client.start_execution(
                                    stateMachineArn=os.getenv('TARGET_ARN'),
                                    name=f"{correlation_id}",
                                    input=json.dumps({
                                        "trace_id": correlation_id,
                                        "bucket": s3_bucket,
                                        "key": s3_key
                                    })
                                )
                            else:
                                http_status_code = http.HTTPStatus.BAD_REQUEST
                                message = f"TARGET_ARN '{envvar_target_arn}' is invalid or not supported by this lambda"
                                logger.error(message)
                                return_body = "{}"

                            logger.info(f"### Finished processing event {processed_events} in this batch ###")
                            processed_events += 1


    return {
        "statusCode": http_status_code,
        "message": f"{processed_events} events successfully processed",
        "body": f"{return_body}"
    }
