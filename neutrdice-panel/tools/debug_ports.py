from docker import DockerClient
from pprint import pprint
client = DockerClient()
for name in ["sealdice", "napcat"]:
    try:
        ct = client.containers.get(name)
        print("CONTAINER", name)
        pprint(ct.attrs.get("NetworkSettings", {}).get("Ports"))
        print("ports attr type:", type(ct.attrs.get("NetworkSettings", {}).get("Ports")))
    except Exception as e:
        print(name, "ERR", e)
