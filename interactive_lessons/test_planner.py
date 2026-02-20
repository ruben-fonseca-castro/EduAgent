import asyncio
import json
import dotenv
from backend.agent.nodes import plan_lesson

async def main():
    dotenv.load_dotenv(".env")
    state = {
        "topic": "Newton's Second Law",
        "extracted_text": "Newton's second law of motion pertains to the behavior of objects for which all existing forces are not balanced. The second law states that the acceleration of an object is dependent upon two variables - the net force acting upon the object and the mass of the object.",
        "student_id": None,
        "input_type": "prompt",
        "raw_input": "Teach me Newton's Second Law"
    }
    res = await plan_lesson(state)
    print(json.dumps(res, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
