from formula import grand_prix


def mp4_20():
    return grand_prix(
        "mclaren-mp4-20-mercedes",
        "#b4b8bc",
        nose_tip=0.24,
        nose_droop=-0.03,
        nose_width=0.045,
        wing="carbon",
        plates="carbon",
        cover="body",
        accent="caliper",
        helmet="caliper",
        airbox=(0.085, 0.15),
        pod_inlet=0.5,
        pod_height=0.2,
        horns=True,
        cover_stripe="carbon",
    )


CARS = {"mclaren-mp4-20-mercedes": mp4_20}
