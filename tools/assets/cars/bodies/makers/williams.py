from formula import grand_prix


def fw26():
    return grand_prix(
        "williams-fw26-bmw",
        "#f3f3ef",
        nose_tip=0.27,
        nose_droop=-0.02,
        nose_width=0.07,
        wing="livery_dark",
        plates="livery_dark",
        cover="livery_dark",
        accent="livery_dark",
        helmet="livery_dark",
        pod_height=0.21,
    )


CARS = {"williams-fw26-bmw": fw26}
