import copy
import hashlib
import json
import pytest

RULES = ["Activities must be free for participants.", "Activities must teach open-source software development.", "Learning materials must be published openly."]
BODY = "We will teach open-source software development at a free workshop. Learning materials will be published openly."


def addr(value):
    return ("0x" + value.hex() if isinstance(value, bytes) else str(value)).lower()


def response(statuses=("PASS", "PASS", "PASS")):
    return {"checks": [{"rule_index": i, "status": s, "quote": BODY if s != "UNCLEAR" else "", "reason": "The proposal addresses this criterion."} for i, s in enumerate(statuses)]}


def mock(vm, payload):
    vm.clear_mocks()
    vm.mock_llm("CHARTERGATE_RULES_V1", json.dumps(payload))


@pytest.fixture
def c(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    return direct_deploy("contracts/chartergate.py")


@pytest.fixture
def cid(c, direct_alice, direct_bob):
    c.create_community("Builders", json.dumps(RULES), json.dumps([addr(direct_alice), addr(direct_bob)]), 2)
    return c.list_communities(0, 20)["items"][0]["id"]


def propose(c, vm, cid, statuses=("PASS", "PASS", "PASS"), body=BODY, parent=""):
    payload = response(statuses)
    for row in payload["checks"]:
        if row["quote"]:
            row["quote"] = body[:300]
    mock(vm, payload)
    c.submit_proposal(cid, "Workshop", body, parent)
    return c.list_proposals(cid, 0, 20)["items"][0]["id"]


def test_create_immutable_charter(c, cid, direct_alice):
    record = c.get_community(cid)
    assert record["rules"] == RULES and record["quorum"] == 2
    assert record["owner"] == addr(direct_alice)
    assert c.get_config()["treasury_access"] is False
    assert c.get_config()["community_count"] == 1


@pytest.mark.parametrize("statuses,verdict", [(("PASS","PASS","PASS"), "ELIGIBLE"), (("FAIL","PASS","PASS"),"INELIGIBLE"), (("UNCLEAR","PASS","PASS"),"NEEDS_CLARIFICATION"), (("UNCLEAR","FAIL","PASS"),"INELIGIBLE")])
def test_deterministic_gate(c, cid, direct_vm, statuses, verdict):
    pid = propose(c, direct_vm, cid, statuses)
    assert c.get_proposal(pid)["review"]["verdict"] == verdict
    assert c.evaluate_eligibility_view(cid, pid)["satisfied"] is (verdict == "ELIGIBLE")
    assert c.evaluate_eligibility_view("wrong-community", pid)["satisfied"] is False
    assert c.evaluate_eligibility_view(cid, "missing")["satisfied"] is False


@pytest.mark.parametrize("statuses", [("FAIL","PASS","PASS"),("UNCLEAR","PASS","PASS")])
def test_nonpasses_cannot_vote_or_close_or_change_history(c, cid, direct_vm, statuses):
    pid = propose(c, direct_vm, cid, statuses)
    before = c.get_proposal(pid)
    with direct_vm.expect_revert("VOTING_BLOCKED"):
        c.vote(pid, "YES")
    with direct_vm.expect_revert("INELIGIBLE_BALLOT"):
        c.close_ballot(pid)
    assert c.get_proposal(pid) == before


def test_full_ballot_lifecycle(c, cid, direct_vm, direct_alice, direct_bob):
    pid = propose(c, direct_vm, cid)
    c.vote(pid, "YES")
    with direct_vm.expect_revert("ALREADY_VOTED"):
        c.vote(pid, "NO")
    with direct_vm.expect_revert("QUORUM_NOT_REACHED"):
        c.close_ballot(pid)
    direct_vm.sender = direct_bob
    c.vote(pid, "YES")
    with direct_vm.expect_revert("ONLY_COMMUNITY_OWNER"):
        c.close_ballot(pid)
    direct_vm.sender = direct_alice
    c.close_ballot(pid)
    ballot = c.get_proposal(pid)["ballot"]
    assert ballot["yes"] == 2 and ballot["no"] == 0
    assert ballot["closed"] and ballot["outcome"] == "PASSED"
    assert c.get_vote(pid, addr(direct_bob))["choice"] == "YES"
    with direct_vm.expect_revert("BALLOT_CLOSED"):
        c.vote(pid, "YES")
    with direct_vm.expect_revert("BALLOT_CLOSED"):
        c.close_ballot(pid)


def test_tie_not_passed(c, cid, direct_vm, direct_alice, direct_bob):
    pid = propose(c, direct_vm, cid)
    c.vote(pid,"YES")
    direct_vm.sender = direct_bob
    c.vote(pid,"NO")
    direct_vm.sender = direct_alice
    c.close_ballot(pid)
    assert c.get_proposal(pid)["ballot"]["outcome"] == "NOT_PASSED"


def test_unlisted_wallet_and_invalid_choice(c, cid, direct_vm, direct_charlie):
    pid = propose(c, direct_vm, cid)
    with direct_vm.expect_revert("Vote YES or NO"):
        c.vote(pid,"MAYBE")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("NOT_AN_ALLOWED_VOTER"):
        c.vote(pid,"YES")
    assert c.get_proposal(pid)["ballot"]["yes"] == 0


def test_revision_preserves_failed_parent(c, cid, direct_vm, direct_bob, direct_alice):
    pid = propose(c,direct_vm,cid,("FAIL","PASS","PASS"))
    original = c.get_proposal(pid)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("ONLY_AUTHOR_CAN_REVISE"):
        propose(c,direct_vm,cid,body=BODY+" Everyone is welcome.",parent=pid)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("REVISION_MUST_CHANGE_BODY"):
        propose(c,direct_vm,cid,parent=pid)
    revised = propose(c,direct_vm,cid,body=BODY+" Everyone is welcome.",parent=pid)
    assert revised != pid and c.get_proposal(revised)["parent_id"] == pid
    assert c.get_proposal(pid) == original
    assert c.list_proposals(cid,0,20)["total"] == 2
    with direct_vm.expect_revert("ELIGIBLE_PROPOSAL_IS_FROZEN"):
        propose(c,direct_vm,cid,body=BODY+" New change.",parent=revised)


def test_identical_text_cannot_reroll_with_different_title_or_author(c,cid,direct_vm,direct_bob):
    propose(c,direct_vm,cid)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("IDENTICAL_PROPOSAL_ALREADY_SCREENED"):
        c.submit_proposal(cid,"Different title",BODY,"")


@pytest.mark.parametrize("mutation", ["missing_check","duplicate_index","invalid_status","invented_quote","blank_pass","empty_reason","long_reason","non_object","string_index","boolean_index"])
def test_malformed_llm_fails_without_record(c,cid,direct_vm,mutation):
    payload=response()
    if mutation=="missing_check": payload["checks"].pop()
    elif mutation=="duplicate_index": payload["checks"][1]["rule_index"]=0
    elif mutation=="invalid_status": payload["checks"][0]["status"]="APPROVE"
    elif mutation=="invented_quote": payload["checks"][0]["quote"]="words not present"
    elif mutation=="blank_pass": payload["checks"][0]["quote"]=""
    elif mutation=="empty_reason": payload["checks"][0]["reason"]=""
    elif mutation=="long_reason": payload["checks"][0]["reason"]="x"*401
    elif mutation=="non_object": payload=[]
    elif mutation=="string_index": payload["checks"][0]["rule_index"]="0"
    elif mutation=="boolean_index": payload["checks"][0]["rule_index"]=False
    mock(direct_vm,payload)
    with direct_vm.expect_revert("LLM_ERROR"):
        c.submit_proposal(cid,"Test",BODY,"")
    assert c.list_proposals(cid,0,20)["total"]==0


def test_validator_rechecks_each_rule(c,cid,direct_vm):
    propose(c,direct_vm,cid,("FAIL","PASS","PASS"))
    # Same overall verdict, DIFFERENT failing rule must disagree.
    mock(direct_vm,response(("PASS","FAIL","PASS")))
    assert direct_vm.run_validator() is False


def test_validator_allows_prose_not_decision_differences(c,cid,direct_vm):
    propose(c,direct_vm,cid)
    payload=response()
    for row in payload["checks"]: row["reason"]="A differently worded explanation."
    mock(direct_vm,payload)
    assert direct_vm.run_validator() is True
    assert direct_vm.run_validator(leader_error=Exception("failed")) is False
    fabricated=copy.deepcopy(payload)
    fabricated["checks"][0]["quote"]="invented"
    assert direct_vm.run_validator(leader_result=fabricated) is False


@pytest.mark.parametrize("rules,voters,quorum", [( [],None,1),([""],None,1),(["x"]*7,None,1),(["x","X"],None,1),(["x"],[],1),(["x"],["bad"],1),(["x"],["0x"+"0"*40],1),(["x"],None,0),(["x"],None,3)])
def test_invalid_community(c,direct_vm,direct_alice,rules,voters,quorum):
    if voters is None: voters=[addr(direct_alice)]
    with direct_vm.expect_revert("EXPECTED"):
        c.create_community("Test",json.dumps(rules),json.dumps(voters),quorum)
    assert c.get_config()["community_count"]==0


def test_duplicate_wallet_and_community(c,cid,direct_vm,direct_alice,direct_bob):
    with direct_vm.expect_revert("Duplicate"):
        c.create_community("Test",json.dumps(RULES),json.dumps([addr(direct_alice),addr(direct_alice)]),1)
    with direct_vm.expect_revert("Community already exists"):
        c.create_community("Builders",json.dumps(RULES),json.dumps([addr(direct_bob),addr(direct_alice)]),2)


def test_pagination_and_input_boundaries(c,cid,direct_vm):
    assert c.list_communities(100,20)["items"]==[]
    assert c.list_proposals("missing",0,20)["total"]==0
    with direct_vm.expect_revert("limit"):
        c.list_proposals(cid,0,21)
    with direct_vm.expect_revert("Text must"):
        c.submit_proposal(cid,"","body","")
    with direct_vm.expect_revert("Text must"):
        c.submit_proposal(cid,"title","x"*5001,"")
